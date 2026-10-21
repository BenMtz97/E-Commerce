FROM node:22-slim AS frontend-builder

WORKDIR /frontend

COPY package.json .npmrc tsconfig.json vite.config.ts index.html ./
COPY src/ ./src/

RUN npm install --legacy-peer-deps --no-audit --no-fund && \
    npm run build

FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gcc libpq-dev nodejs npm && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY package.json .npmrc tsconfig.json vite.config.ts index.html ./
COPY --from=frontend-builder /frontend/node_modules ./node_modules
COPY --from=frontend-builder /frontend/dist ./dist
COPY src/ ./src/
COPY app/ ./app/
COPY tests/ ./tests/
COPY main.py pytest.ini ./

RUN useradd -u 1000 -m appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
