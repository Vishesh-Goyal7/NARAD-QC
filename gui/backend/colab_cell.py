# Paste this cell into Colab AFTER running the notebook through Phase 6.
# Upload the updated gui_bridge.py to your Drive folder or /content/gui_bridge.py.
from pathlib import Path
import importlib.util
import threading
import time
import urllib.request
import json
import uvicorn

_bridge_path = next((p for p in [Path('/content/drive/MyDrive/NARAD_QC/gui_bridge.py'), Path('/content/gui_bridge.py')] if p.exists()), Path('/content/gui_bridge.py'))
if not _bridge_path.exists():
    raise FileNotFoundError('Upload gui/backend/gui_bridge.py to the Colab Files panel first.')
_previous_gui = globals().get('NARAD_GUI_SERVER')
_previous_gui_thread = globals().get('NARAD_GUI_THREAD')
_previous_gui_app = globals().get('NARAD_GUI_APP')
def _gui_jobs_active():
    return _previous_gui_app is not None and any(j['status'] in ('QUEUED','RUNNING') for j in getattr(_previous_gui_app.state,'gui_jobs',{}).values())
if _gui_jobs_active():
    raise RuntimeError('Wait for current GUI jobs to finish before replacing the bridge.')
if _previous_gui_thread is not None and _previous_gui_thread.is_alive():
    _previous_gui.should_exit = True
    _previous_gui_thread.join(timeout=5)
    if _previous_gui_thread.is_alive():
        raise RuntimeError('Previous GUI server did not stop cleanly. Restart the runtime before installing.')
if _gui_jobs_active():
    raise RuntimeError('A job started while the server was stopping. Let it finish before rerunning this cell.')
if _previous_gui_app is not None:
    _previous_gui_app.state.gui_pool.shutdown(wait=True)
_spec = importlib.util.spec_from_file_location('narad_gui_bridge', _bridge_path)
_bridge = importlib.util.module_from_spec(_spec)
# Required by Pydantic to resolve postponed type annotations.
import sys
sys.modules[_spec.name] = _bridge
_spec.loader.exec_module(_bridge)
NARAD_GUI_APP = _bridge.install_gui_bridge(globals())
NARAD_GUI_SERVER = uvicorn.Server(uvicorn.Config(NARAD_GUI_APP, host='127.0.0.1', port=8002, log_level='warning'))
NARAD_GUI_THREAD = threading.Thread(target=NARAD_GUI_SERVER.run, name='NARAD-GUI', daemon=True)
NARAD_GUI_THREAD.start()
for _ in range(50):
    try:
        _request = urllib.request.Request('http://127.0.0.1:8002/gui/health', headers={'X-NARAD-API-Key': NARAD_API_ACCESS_KEY})
        with urllib.request.urlopen(_request, timeout=1) as _response:
            assert json.load(_response)['bridge'] == 'NARAD-QC-GUI'
        break
    except Exception:
        time.sleep(.2)
else:
    raise RuntimeError('GUI bridge failed to start on port 8002.')
print('GUI bridge ready on http://127.0.0.1:8002')
print('Bridge version:', _bridge.VERSION)
print('Use your existing NARAD_API_ACCESS_KEY in the React connection dialog; do not save it in source.')
# Expose this NEW port, not the legacy port 8001:
# !cloudflared tunnel --url http://127.0.0.1:8002
# Copy its https://….trycloudflare.com URL into the GUI connection dialog.
