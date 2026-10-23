FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/backend OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.lock.txt /app/backend/requirements.lock.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.lock.txt
COPY backend/narad_backend /app/backend/narad_backend
COPY gui/backend/gui_bridge.py /app/gui/backend/gui_bridge.py
COPY gui/examples/network.json /app/gui/examples/network.json
RUN useradd --create-home narad && mkdir -p /app/backend/artifacts \
    && chown -R narad:narad /app
USER narad
EXPOSE 8002
CMD ["python", "-m", "narad_backend", "serve", "--host", "0.0.0.0", "--port", "8002"]
