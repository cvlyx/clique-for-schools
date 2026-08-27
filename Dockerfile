# Single-service deploy: builds the Clique React frontend (Node) and runs the
# FastAPI backend which also serves that built frontend on the same origin.
# Works on Render (Docker), Railway, Fly.io, etc.

# ---- Stage 1: build the React frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /app
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/api-client-react/ ./packages/api-client-react/
COPY packages/api-client-react/package.json ./packages/api-client-react/package.json
COPY frontend/package.json ./frontend/package.json
RUN corepack enable
RUN pnpm install --frozen-lockfile || pnpm install
COPY frontend/ ./frontend/
RUN pnpm --filter @workspace/clique-for-schools build

# ---- Stage 2: Python runtime with backend + built frontend ----
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 10000
WORKDIR /app/backend
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "10000"]
