# Multi-stage build for Validador RIPS (NC Processor)
# Stage 1: Build frontend (Vite)
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend (Vite outputs to dist/)
RUN npm run build

# Stage 2: Backend + Frontend served by FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code (structure: /app/app/, /app/requirements.txt)
COPY backend/ ./

# Copy built frontend from previous stage (Vite outputs to dist/)
# Final path: /app/frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=60s --timeout=30s --start-period=60s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Start the application (run from backend dir so app module resolves)
WORKDIR /app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
