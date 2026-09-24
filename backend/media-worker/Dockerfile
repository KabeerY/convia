FROM python:3.12-slim
WORKDIR /app
COPY packages/contracts packages/contracts
COPY backend/media-worker backend/media-worker
RUN pip install --no-cache-dir ./packages/contracts ./backend/media-worker
EXPOSE 4200
CMD ["python", "-m", "media_worker.worker"]
