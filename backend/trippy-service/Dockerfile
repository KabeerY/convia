FROM python:3.12-slim
WORKDIR /app
COPY backend/trippy-service backend/trippy-service
RUN pip install --no-cache-dir ./backend/trippy-service
EXPOSE 4100
CMD ["uvicorn", "trippy_service.app:app", "--host", "0.0.0.0", "--port", "4100"]
