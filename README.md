# Driver Scheduling Management System

FastAPI + PostgreSQL backend with a React/Vite frontend for uploading weekly plans, managing drivers/routes, and tracking availability. Built for production hosting with clear API and CORS configuration.

## Stack
- Backend: FastAPI, Supabase/PostgreSQL, optional Google Sheets sync (`services/google_sheets_service.py`)
- Frontend: React 18 + Vite, Lucide icons
- AuthZ/CORS: configurable via environment (`FRONTEND_URL`)

## Prerequisites
- Python 3.10+ and `pip`
- Node.js 18+ and `npm`
- A PostgreSQL database (Supabase works fine)
- Excel files that match the expected sheets for weekly plans

## Backend (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # or: source venv/bin/activate
pip install -r requirements.txt

# Configure env
cp .env.example .env
# Edit .env with your values:
#   DATABASE_URL=postgres://...
#   SUPABASE_URL=...
#   SUPABASE_KEY=...
#   DEBUG=True|False
#   FRONTEND_URL=http://localhost:5173        # your frontend origin
#   GOOGLE_CREDENTIALS_FILE=service-account-credentials.json
#   GOOGLE_SHEET_NAME=...
#   ENABLE_GOOGLE_SHEETS_SYNC=True|False

# Run dev server
python main.py         # starts on http://localhost:8000
```

**Database migrations:** run the SQL in `database/migrations.sql` against your database (Supabase SQL editor or psql).  
**Health/API docs:** `GET /health` and `http://localhost:8000/docs`.

## Frontend (Vite + React)
```bash
cd frontend
npm install

# Configure API target (and optional embeds)
echo "VITE_API_BASE_URL=http://localhost:8000/api/v1" > .env
echo "VITE_CHATBOT_URL=https://chat.bubbleexplorer.com/login" >> .env
echo "VITE_SHEET_URL=https://docs.google.com/spreadsheets/d/1eSjXF8_5GPyLr_spCQGcLU8Kx47XHcERlAUqROi8Hoc/edit?usp=sharing" >> .env
echo "VITE_PLAN_ENDPOINT=http://localhost:8000/api/v1/assistant/optimize-week" >> .env
echo "VITE_NOTIFICATION_ENDPOINT=http://localhost:8000/api/v1/notifications" >> .env  # or set to your notifications feed

# Run dev server (default: http://localhost:5173)
npm run dev
```

The frontend picks up `VITE_API_BASE_URL`; the backend should allow that origin via `FRONTEND_URL`.

## Running locally
1) Start the backend: `cd backend && venv\Scripts\activate && python main.py`  
2) Start the frontend: `cd frontend && npm run dev`  
3) Use the Upload tab to load a weekly plan (Excel) and then explore Drivers/Routes/Availability/Assignments.

## Production/Hosting checklist
- Backend
  - Set real env values in `.env` (database, CORS `FRONTEND_URL`, Google Sheets creds if used).
  - Run with a process manager or ASGI server, e.g. `uvicorn main:app --host 0.0.0.0 --port 8000` or `gunicorn -k uvicorn.workers.UvicornWorker main:app`.
  - Ensure storage for uploads (`UPLOAD_DIR`) is writable and backed up if needed.
  - Put the service behind HTTPS (nginx/ALB/reverse proxy) and expose `/api/v1/*`.
- Frontend
  - Set `VITE_API_BASE_URL=https://your-backend-host/api/v1`.
  - Build: `npm run build`; serve the `dist/` folder from your web server/ CDN/ object storage.
  - If serving from a different domain, keep CORS in sync with `FRONTEND_URL`.
- Monitoring
  - Health: `/health`
  - API docs: `/docs`

## Key paths
- Backend entry: `backend/main.py`
- Backend config: `backend/config/settings.py` (+ `.env`)
- Database schema: `backend/database/migrations.sql`
- Frontend entry: `frontend/src/App.jsx`
- Frontend styles: `frontend/src/index.css`
