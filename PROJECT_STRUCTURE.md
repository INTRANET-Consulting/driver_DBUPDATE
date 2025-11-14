# 📁 Project Structure Guide

Complete overview of all files and their purposes.

---

## 🏗️ Directory Structure

```
driver-scheduling-upload/
│
├── backend/                          # FastAPI backend
│   ├── main.py                       # ⭐ Main application entry point
│   ├── requirements.txt              # Python dependencies
│   ├── .env                          # ⚙️ Environment configuration (create from .env.example)
│   ├── .env.example                  # Environment template
│   │
│   ├── config/                       # Configuration
│   │   └── settings.py               # App settings (loaded from .env)
│   │
│   ├── database/                     # Database layer
│   │   ├── connection.py             # Connection pool manager
│   │   └── migrations.sql            # ⚙️ Database schema (run in Supabase)
│   │
│   ├── schemas/                      # Data models
│   │   └── models.py                 # Pydantic models for validation
│   │
│   ├── services/                     # Business logic
│   │   ├── excel_parser.py           # 📊 Parse Excel sheets
│   │   └── database_service.py       # Database operations (CRUD)
│   │
│   ├── api/                          # API routes
│   │   └── routes/
│   │       ├── upload.py             # 📤 Upload endpoint (for LibreChat)
│   │       └── weekly_data.py        # 📊 Get routes, drivers, availability
│   │
│   └── uploads/                      # Temporary file storage (auto-created)
│
├── README.md                         # 📖 Full documentation
├── QUICKSTART.md                     # ⚡ 10-minute setup guide
├── PROJECT_STRUCTURE.md              # 📁 This file
└── test_upload.py                    # 🧪 Test script

```

---

## 📄 File Descriptions

### Core Application Files

#### `main.py` ⭐ START HERE
**Purpose:** Main FastAPI application
- Initializes app with CORS
- Registers API routes
- Manages database lifecycle
- Entry point: `python main.py`

**Key Functions:**
- `lifespan()`: Startup/shutdown handling
- Includes routers for upload and weekly data

---

#### `requirements.txt`
**Purpose:** Python dependencies
- FastAPI, Uvicorn (web server)
- openpyxl (Excel parsing)
- asyncpg (PostgreSQL driver)
- pydantic (data validation)

**Usage:**
```bash
pip install -r requirements.txt
```

---

### Configuration Files

#### `.env.example` → `.env` ⚙️
**Purpose:** Environment variables template
- Database credentials
- Supabase URL and key
- App settings (debug, upload dir, CORS)

**Action Required:**
1. Copy to `.env`
2. Fill in your Supabase credentials

---

#### `config/settings.py`
**Purpose:** Load and validate settings from .env
- Uses pydantic-settings
- Provides global `settings` object
- Auto-creates upload directory

**Usage:**
```python
from config.settings import settings
print(settings.DATABASE_URL)
```

---

### Database Layer

#### `database/migrations.sql` ⚙️ RUN FIRST
**Purpose:** Create database schema
- All table definitions
- Indexes for performance
- Triggers for auto-updates
- Default season configuration

**How to Run:**
1. Open Supabase SQL Editor
2. Copy entire file content
3. Paste and execute

**Creates These Tables:**
- `drivers` - Driver information
- `routes` - Route definitions
- `driver_availability` - Who's available when
- `fixed_assignments` - Pre-assigned routes
- `assignments` - OR-Tools results
- `season_config` - Season date ranges
- `school_vacation_periods` - School vacation tracking
- `upload_history` - Audit trail

---

#### `database/connection.py`
**Purpose:** Manage database connections
- Connection pooling (asyncpg)
- Auto-reconnect
- Dependency injection

**Key Class:** `DatabaseManager`
- `connect()`: Initialize pool
- `disconnect()`: Close pool
- `get_db()`: Dependency for routes

---

### Data Models

#### `schemas/models.py`
**Purpose:** Pydantic models for type safety
- Request validation
- Response serialization
- Data structure documentation

**Key Models:**
- `Driver`, `Route`, `DriverAvailability`, `FixedAssignment`
- `UploadRequest`, `UploadResponse`
- `WeeklyRoutesResponse`, `WeeklyDriversResponse`

---

### Business Logic

#### `services/excel_parser.py` 📊 CRITICAL
**Purpose:** Parse all 4 Excel sheets
- **Sheet 1 (Dienste):** Routes and seasonal availability
- **Sheet 2 (Lenker):** Drivers and fixed assignments
- **Sheet 3 (Feiertag):** Public holidays
- **Sheet 4 (Dienstplan):** Remaining hours and school status

**Key Class:** `ExcelParser`
- `parse_all()`: Parse entire workbook
- `parse_dienste_sheet()`: Routes
- `parse_lenker_sheet()`: Drivers
- `parse_feiertag_sheet()`: Holidays
- `parse_dienstplan_sheet()`: Planning data

**Returns:**
```python
{
    'routes': [...],
    'drivers': [...],
    'public_holidays': [...],
    'driver_availability': [...],
    'fixed_assignments': [...],
    'school_days': {date: is_school_day}
}
```

---

#### `services/database_service.py`
**Purpose:** Database operations (CRUD)
- Insert/update drivers, routes, availability
- Query by week
- Delete old data
- Upload history tracking

**Key Class:** `DatabaseService`
- `upsert_driver()`: Create or update driver
- `create_route()`: Add route
- `create_availability()`: Set availability
- `create_fixed_assignment()`: Assign fixed route
- `get_routes_for_week()`: Query routes
- `clear_week_data()`: Delete week data

---

### API Routes

#### `api/routes/upload.py` 📤 FOR LIBRECHAT
**Purpose:** Upload Excel file and populate database

**Endpoint:** `POST /api/v1/upload/weekly-plan`

**Parameters:**
- `file`: Excel file (multipart/form-data)
- `week_start`: Monday date (YYYY-MM-DD)
- `action`: "replace" or "append"
- `unavailable_drivers`: JSON array (optional)

**Process:**
1. Validate file and parameters
2. Save file temporarily
3. Parse Excel → ExcelParser
4. Clear old data (if replace)
5. Insert drivers
6. Insert routes
7. Insert availability (holidays + "frei")
8. Insert fixed assignments
9. Apply manual unavailability
10. Return summary

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
  }
}
```

---

#### `api/routes/weekly_data.py` 📊
**Purpose:** Query uploaded data

**Endpoints:**

1. **`GET /api/v1/weekly/routes`**
   - Get all routes for a week
   - Returns route details (name, date, duration, etc.)

2. **`GET /api/v1/weekly/drivers`**
   - Get all drivers with hours info
   - Returns monthly target, worked, remaining

3. **`GET /api/v1/weekly/availability`**
   - Get availability for a week
   - Shows who's unavailable and why

4. **`GET /api/v1/weekly/fixed-assignments`**
   - Get fixed route assignments
   - Shows pre-assigned routes

5. **`GET /api/v1/weekly/summary`**
   - Get overview of all data
   - Statistics + sample data

---

### Testing & Documentation

#### `test_upload.py` 🧪
**Purpose:** Test all endpoints
- Health check
- Upload file
- Query routes, drivers, availability
- Verify data

**Usage:**
```bash
# Edit EXCEL_FILE_PATH and WEEK_START
python test_upload.py
```

---

#### `README.md` 📖
**Purpose:** Complete documentation
- Architecture overview
- Setup instructions
- API reference
- Excel format requirements
- Troubleshooting

---

#### `QUICKSTART.md` ⚡
**Purpose:** Fast setup guide
- 10-minute setup
- Step-by-step with screenshots
- Common issues
- Checklist

---

## 🔄 Data Flow

```
1. Excel File
   ↓
2. Upload API (upload.py)
   ↓
3. ExcelParser (excel_parser.py)
   ↓ parsed data
4. DatabaseService (database_service.py)
   ↓ SQL operations
5. Supabase PostgreSQL
   ↓
6. Weekly Data API (weekly_data.py)
   ↓
7. Frontend / LibreChat / OR-Tools
```

---

## 🎯 Key Files for Different Tasks

### Setting Up
1. `migrations.sql` - Create database
2. `.env` - Configure credentials
3. `requirements.txt` - Install dependencies
4. `main.py` - Run application

### Understanding Excel Parsing
1. `services/excel_parser.py` - Parsing logic
2. `README.md` - Excel format documentation

### Using the API
1. `api/routes/upload.py` - Upload endpoint
2. `api/routes/weekly_data.py` - Query endpoints
3. `README.md` - API examples

### Testing
1. `test_upload.py` - Run tests
2. `QUICKSTART.md` - Manual testing guide

### Troubleshooting
1. `README.md` - Troubleshooting section
2. `QUICKSTART.md` - Common issues
3. Terminal logs (when running main.py)

---

## 📝 Quick Reference

### Start Backend
```bash
cd backend
python main.py
```

### Upload File (curl)
```bash
curl -X POST "http://localhost:8000/api/v1/upload/weekly-plan" \
  -F "file=@plan.xlsx" \
  -F "week_start=2025-07-07" \
  -F "action=replace"
```

### Get Routes
```bash
curl "http://localhost:8000/api/v1/weekly/routes?week_start=2025-07-07"
```

### View API Docs
```
http://localhost:8000/docs
```

---

## 🚀 Next Steps

1. **Read QUICKSTART.md** - Get up and running
2. **Run test_upload.py** - Verify everything works
3. **Check README.md** - Deep dive into features
4. **Integrate with LibreChat** - Use upload endpoint
5. **Build Frontend** - React app for visualization

---

## 💡 Tips

- **Logs:** Watch terminal where `main.py` runs
- **Database:** Check Supabase for data
- **API Docs:** http://localhost:8000/docs for interactive testing
- **Debugging:** Set `DEBUG=True` in .env for detailed logs

---

## ✅ File Checklist

After setup, you should have:

- [x] `migrations.sql` - Run in Supabase ✅
- [x] `.env` - Created and configured ⚙️
- [x] `venv/` - Virtual environment ✅
- [x] All dependencies installed ✅
- [x] `uploads/` - Auto-created directory ✅
- [x] Backend running on port 8000 ✅

---

**🎉 You now understand every file in the project!**