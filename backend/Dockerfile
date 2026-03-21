FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.runtime.txt /tmp/requirements.runtime.txt
RUN pip install --no-cache-dir -r /tmp/requirements.runtime.txt

COPY backend /app/backend
COPY stocks.json /app/stocks.json

WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
