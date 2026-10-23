"""ASGI factory: existing frontend uses /gui; notebook endpoints live under /api."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from .runtime import ROOT, create_runtime, environment_worker_limit


def create_app():
    origins = [s.strip() for s in os.environ.get('NARAD_ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',') if s.strip()]
    if not origins or '*' in origins:
        raise RuntimeError('NARAD_ALLOWED_ORIGINS must list exact frontend origins.')
    engine, bridge = create_runtime(
        calibration_path=os.environ.get('NARAD_CALIBRATION_PATH', str(ROOT/'backend/artifacts/policy_c.joblib')),
        api_key=os.environ.get('NARAD_API_ACCESS_KEY',''), worker_limit=environment_worker_limit(),
        graph_path=os.environ.get('NARAD_NETWORK_PATH'))
    legacy = engine.app
    public_path = engine._narad_api_path_is_public
    engine._narad_api_path_is_public = lambda path: public_path(path[4:] if path.startswith('/api/') else path)
    # Rebuild the notebook transport CORS around its auth boundary, using exact origins.
    legacy.user_middleware[:] = [m for m in legacy.user_middleware if m.cls is not CORSMiddleware]
    legacy.middleware_stack = None
    legacy.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['*'], allow_headers=['*'])
    legacy.middleware_stack = None
    gui = bridge.install_gui_bridge(vars(engine), allowed_origins=origins)

    @asynccontextmanager
    async def lifespan(app):
        yield
        # Never abandon a thread that still owns a physical session.
        gui.state.gui_pool.shutdown(wait=True, cancel_futures=True)

    app = FastAPI(title='NARAD-QC standalone backend', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.get('/health')
    def health():
        return {'status':'ok','backend':'NARAD-QC','mode':'local-engine'}

    @app.get('/ready')
    def ready():
        # Models and definitions are validated at startup, without launching QKD.
        return {'ready':True,'controller_worker_limit':engine.NARAD_CONTROLLER_MAX_CPU_WORKERS}

    app.mount('/api', legacy)
    app.mount('/', gui)
    return app
