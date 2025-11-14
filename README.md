# 🚀 Driver Scheduling Upload System

Weekly planning Excel file processor for driver route assignments.

## 📋 Features

- ✅ Upload Excel files with 4 sheets (Dienste, Lenker, Feiertag, Dienstplan)
- ✅ Automatic parsing of routes, drivers, availability, and fixed assignments
- ✅ Season and school status detection
- ✅ Support for combined routes (e.g., "411 + 412")
- ✅ Special duty handling (MB, DI, SOF)
- ✅ Manual driver unavailability specification
- ✅ Replace or append data modes
- ✅ RESTful API for integration with LibreChat

---

## 🏗️ Architecture

```
Backend (FastAPI) → Supabase PostgreSQL
     ↓
Excel Parser → Database Populator
     ↓
REST API ← LibreChat / Frontend
```

---

## 🛠️ Setup Instructions

### 1. Create New Supabase Database

1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Copy your database credentials:
   - Database URL
   - Supabase URL
   - Anon/Public Key

### 2. Run Database Migrations

Execute the SQL in `database/migrations.sql` in your Supabase SQL Editor:

```sql
-- Copy entire content from migrations.sql
-- This creates all tables, indexes, and triggers
```

### 3. Backend Setup

```bash
# Clone/create project directory
cd driver-scheduling-upload/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env with your credentials
# DATABASE_URL=postgresql://user:password@db.xxx.supabase.co:5432/postgres
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_KEY=your_key_here

# Run the application
python main.py
```

The backend will start on `http://localhost:8000`

### 4. Verify Setup

```bash
# Check health
curl http://localhost:8000/health

# View API docs
open http://localhost:8000/docs
```

---

## 📤 API Usage

### Upload Weekly Plan

**Endpoint:** `POST /api/v1/upload/weekly-plan`

**For LibreChat Integration:** This is your action endpoint!

```bash
curl -X POST "http://localhost:8000/api/v1/upload/weekly-plan" \
  -F "file=@weekly_plan.xlsx" \
  -F "week_start=2025-07-07" \
  -F "action=replace" \
  -F 'unavailable_drivers=[{"driver_name":"Merz, Matthias","dates":["2025-07-07","2025-07-08"],"reason":"Vacation"}]'
```

**Parameters:**
- `file`: Excel file (required)
- `week_start`: Monday date in YYYY-MM-DD format (required)
- `action`: "replace" or "append" (default: "replace")
- `unavailable_drivers`: JSON array (optional)

**Response:**
```json
{
  "success": true,
  "week_start": "2025-07-07",
  "season": "summer",
  "school_status": "mit_schule",
  "records_created": {
    "drivers": 15,
    "routes": 120,
    "driver_availability": 75,
    "fixed_assignments": 30
  },
  "action_taken": "replace",
  "message": "Successfully processed weekly_plan.xlsx"
}
```

### Get Weekly Routes

```bash
curl "http://localhost:8000/api/v1/weekly/routes?week_start=2025-07-07"
```

### Get Weekly Drivers

```bash
curl "http://localhost:8000/api/v1/weekly/drivers?week_start=2025-07-07"
```

### Get Weekly Availability

```bash
curl "http://localhost:8000/api/v1/weekly/availability?week_start=2025-07-07"
```

### Get Weekly Summary

```bash
curl "http://localhost:8000/api/v1/weekly/summary?week_start=2025-07-07"
```

---

## 📊 Excel File Structure Expected

### Sheet 1: Dienste (Routes)

**Table 1:** Route definitions
| Linien/Dienst | Dienst-Nr | VAD [mS] | VAD [oS] | Diäten | Tag    | KFZ-Ort  |
|---------------|-----------|----------|----------|--------|--------|----------|
| Dienst 1      | 401mS     | 10:53    | 00:00    | 11     | Mo-Fr  | Leiten   |
| Dienst 45     | 452SA     | 08:30    | 08:30    | 9      | Sa.    | Oberglan |

**Important:** Routes ending with **"SA"** are Saturday-only routes.
- Regular routes (without SA) run Monday-Friday only
- SA routes run only on Saturday
- Example: 452SA, 431SA are Saturday routes

**Table 2:** Seasonal availability
| SmS   | SoS   | WmS   | WoS   |
|-------|-------|-------|-------|
| 401mS | 431oS | 401mS | 431oS |
| 452SA | 452SA | 452SA | 452SA |

### Sheet 2: Lenker (Drivers)

| Lenker          | Soll-Std | B-Grad | Feiertag | Krankenstand | Fixdienst m.S. | Fixdienst o.S. |
|-----------------|----------|--------|----------|--------------|----------------|----------------|
| Blaskovic, N.   | 174:00   | 100%   | 07:01    | 08:02        | 409            | frei           |

### Sheet 3: Feiertag (Public Holidays)

| Date       | Holiday Name           |
|------------|------------------------|
| 01-01-2025 | Neujahr                |
| 06-01-2025 | Heilige Drei Könige    |

### Sheet 4: Dienstplan (Weekly Planning)

Left section: Driver list with Soll-Std (target) and Ist-Std (worked)

Right section: Weekly calendar with dates

Above dates: "Schule" or "Schulfrei" indicators

---

## 🔧 Configuration

### Season Configuration

Default seasons are configured in database:
- **Summer:** June 1 - September 30
- **Winter:** October 1 - May 31

To modify, update `season_config` table.

### School Vacation Detection

School status is determined by:
1. "Schule" / "Schulfrei" indicators in Sheet 4 (above date columns)
2. Public holidays from Sheet 3
3. Can be extended via `school_vacation_periods` table

---

## 🎯 Integration with LibreChat

### Action Configuration

Create a LibreChat action with:

**URL:** `http://your-backend:8000/api/v1/upload/weekly-plan`

**Method:** POST

**Parameters:**
```json
{
  "file": "{{file}}",
  "week_start": "{{week_start}}",
  "action": "{{action}}",
  "unavailable_drivers": "{{unavailable_drivers}}"
}
```

**Example Prompt:**
```
Upload the weekly planning file for the week starting July 7, 2025.
Mark Merz Matthias as unavailable on July 7-8.
```

---

## 🗂️ Database Schema

### Key Tables

**drivers**
- driver_id (PK)
- name
- details (JSONB) - contains monthly hours, employment %, fixed routes, etc.
- created_at

**routes**
- route_id (PK)
- date, route_name
- details (JSONB) - duration, diäten, vad_time, location, type
- day_of_week
- created_at

**driver_availability**
- id (PK)
- driver_id (FK → drivers)
- date
- available (boolean)
- shift_preference, notes
- created_at, updated_at

**fixed_assignments**
- id (PK)
- driver_id, route_id
- date
- created_at, updated_at

**assignments**
- id (PK)
- week_start
- assignments (JSONB) - stores OR-Tools optimization results
- created_at

---

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Test connection
python -c "import asyncpg; import asyncio; asyncio.run(asyncpg.connect('YOUR_DATABASE_URL'))"
```

### File Upload Issues

- Check MAX_FILE_SIZE in settings (default 10MB)
- Ensure UPLOAD_DIR exists and is writable
- Verify Excel file format (.xlsx or .xls)

### Parsing Issues

- Ensure Excel sheets are named exactly: "Dienste", "Lenker", "Feiertag", "Dienstplan"
- Check that columns are in expected positions
- Look for errors in logs

---

## 📝 Development

### Run in Debug Mode

```bash
DEBUG=True python main.py
```

### View Logs

```bash
# Backend logs will show:
# - Excel parsing progress
# - Database operations
# - Errors and warnings
```

### API Documentation

Visit `http://localhost:8000/docs` for interactive Swagger UI

---

## 🚢 Production Deployment

### Using Systemd (Linux)

```bash
# Create service file
sudo nano /etc/systemd/system/driver-upload.service

[Unit]
Description=Driver Scheduling Upload API
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python main.py
Restart=always

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable driver-upload
sudo systemctl start driver-upload
sudo systemctl status driver-upload
```

### Using Docker (Optional)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["python", "main.py"]
```

---

## 📞 Support

For issues or questions, check:
1. `/logs` directory for error logs
2. Supabase database logs
3. FastAPI interactive docs at `/docs`

---

## 📄 License

Internal use only