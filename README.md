# Clique for Schools

A multi-tenant school management platform. React frontend (the *Clique for
Schools* dashboard) backed by a FastAPI + SQLAlchemy backend, adapted from the
Lidoma school-reporting system. Schools register, a **platform administrator**
approves them, and each approved school only ever sees and modifies its own
data.

## Repository layout

```
backend/          FastAPI + SQLAlchemy multi-tenant API
frontend/         Clique for Schools React (Vite) dashboard
packages/
  api-client-react  Generated API client used by the frontend
spec/openapi.yaml   The API contract the frontend consumes
render.yaml       Blueprint for deploying the backend on Render
vercel.json       Config for deploying the frontend on Vercel
```

## Multi-tenancy

A `schools` table is the tenant root. Every `User`, `Student`, `GradeRecord`,
`SchoolReport`, `AppSetting`, `SchoolAsset`, `SchoolClass` and `Notice` row is
scoped by `school_id`. The backend derives the school from the JWT of the signed
in user, so tenants are fully isolated by the model and query layers.

Roles:

- `platform_admin` — a Clique operator. Can list schools, approve/deny
  registrations, and manually provision a school (which starts active without
  needing approval).
- `admin` / `teacher` / `parent` — school users. `admin` can add students and
  grades and manage the school's settings/logo/notices.

### The school lifecycle

1. A school submits `POST /api/register` (school name + admin `name`,
   `username`, `password`). The school is created as **provisional**.
2. A `platform_admin` reviews it via `GET /api/platform/schools` and calls
   `POST /api/platform/schools/{id}/approve` (or `/deny`).
   Alternatively `POST /api/platform/schools/manual` provisions a school that is
   **active immediately**.
3. Only after approval can the school `POST /api/auth/login` (provisional
   logins are rejected with `403`) and use the Clique pages backed by real data.

## Backend

### Local setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.start .env          # then edit secrets
uvicorn app:app --reload
```

Docs live at `http://localhost:8000/docs`. On first startup the `platform_admin`
is seeded from `PLATFORM_ADMIN_USERNAME` / `PLATFORM_ADMIN_PASSWORD`.

### Configuration (backend/.env)

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///clique.db` | Use `postgresql+psycopg://...` in production |
| `JWT_SECRET` | `change-me` | Signing key for access tokens |
| `JWT_MINUTES` | `720` | Token lifetime |
| `PLATFORM_ADMIN_USERNAME` | `clique-admin` | Seeded platform admin |
| `PLATFORM_ADMIN_PASSWORD` | `change-me` | Seeded platform admin password |
| `ALLOWED_ORIGINS` | localhost list | Comma-separated CORS origins |

### Tests

```bash
cd backend
python3 test_app.py    # registration → approval → login → CRUD → manual/deny
```

## Frontend

The React app is a pnpm workspace with `frontend/` and the vendored
`packages/api-client-react`. The generated client calls the backend at
`VITE_API_URL` (default `/api` — use this when the app is served behind the API,
or set it to the Render backend URL for a separate Vercel deploy).

```bash
pnpm install
pnpm --filter @workspace/clique-for-schools dev      # standalone dev (needs VITE_API_URL)
pnpm --filter @workspace/clique-for-schools build    # production build → frontend/dist
```

At runtime `src/lib/api.ts` configures the generated client's base URL and
attaches each user's JWT (`clique-token` in `localStorage`) to every request.
The `sign-up` and `sign-in` forms call the real registration/login endpoints and
handle the provisional → approved flow. The core pages (Dashboard, Students,
Classes, Notices, Reports, Settings) read and write the backend through the
generated client.

## Platform admin

A Clique operator (`role = platform_admin`) lands on `/platform` after signing
in. That screen lists every school (pending / active / rejected) with
**Approve** / **Deny** buttons and a **Provision school** form for manually
provisioning an already-active school (then share the admin credentials with
them). All of it talks to the `/api/platform/*` endpoints.

## Deployment

Two supported paths:

**A — Single service (recommended for simplicity):** build the whole thing into
one web service with the included `Dockerfile` (Node builds the frontend, Python
runs the API and serves the built UI). Same origin, so the app calls `/api`
directly with no CORS and no cross-origin secrets. Works on Render (Docker),
Railway, Fly.io, any Docker host.

**B — Two services (backend / frontend split):**
- Backend — `render.yaml` (Render). Set a managed Postgres `DATABASE_URL` and
  real `JWT_SECRET` / platform-admin credentials.
- Frontend — `vercel.json` (Vercel). Set `VITE_API_URL` to the backend URL in
  the Vercel environment variables.

Either way, on first boot the `platform_admin` is seeded from
`PLATFORM_ADMIN_USERNAME` / `PLATFORM_ADMIN_PASSWORD` (for Render with
`generateValue: true`, read the generated value in the Render env vars).
Provision or approve schools, then share a school's login with its admin.
