# ⚡ Quick Start Guide

Get the Driver Scheduling Upload System running in 10 minutes!

---

## 🎯 What You Need

- [ ] Python 3.9+ installed
- [ ] Supabase account (free tier works)
- [ ] Your Excel weekly planning file
- [ ] VS Code or any code editor

---

## 📋 Step-by-Step Setup

### Step 1: Create Supabase Database (5 minutes)

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in:
   - Name: `driver-scheduling`
   - Database Password: (save this!)
   - Region: Choose closest to you
4. Wait for project to initialize (~2 minutes)
5. Copy these credentials:
   - Go to Settings → Database → Connection String
   - Copy the URI (starts with `postgresql://...`)
   - Go to Settings → API → Project URL (your Supabase URL)
   - Copy anon/public key

### Step 2: Run Database Migrations (2 minutes)

1. In Supabase, click "SQL Editor" (left sidebar)
2. Click "New Query"
3. Copy entire content from `database/migrations.sql`
4. Paste and click "Run"
5. You should see: "Success. No rows returned"

### Step 3: Setup Backend (3 minutes)

```bash
# 1. Navigate to backend folder
cd path/to/driver-scheduling-upload/backend

# 2. Create virtual environment
python -m venv venv

# 3. Activate it
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create .env file
copy .env.example .env   # Windows
# or
cp .env.example .env     # Mac/Linux

# 6. Edit .env and add your credentials
```

**Edit `.env` file:**
```bash
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
SUPABASE_KEY=[YOUR-ANON-KEY]
DEBUG=True
```

### Step 4: Start the Backend

```bash
python main.py
```

You should see:
```
🚀 Starting Driver Scheduling Upload System...
✅ Database connected
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Step 5: Test It! 🎉

Open another terminal and run:

```bash
# Test health endpoint
curl http://localhost:8000/health

# Should return:
# {"status":"healthy","database":"connected"}
```

---

## 📤 Upload Your First File

### Option A: Using curl (Command Line)

```bash
curl -X POST "http://localhost:8000/api/v1/upload/weekly-plan" \
  -F "file=@your_excel_file.xlsx" \
  -F "week_start=2025-07-07" \
  -F "action=replace"
```

### Option B: Using Python Script

```python
import requests

files = {'file': open('your_excel_file.xlsx', 'rb')}
data = {
    'week_start': '2025-07-07',
    'action': 'replace'
}

response = requests.post(
    'http://localhost:8000/api/v1/upload/weekly-plan',
    files=files,
    data=data
)

print(response.json())
```

### Option C: Using Swagger UI (Interactive)

1. Open browser: http://localhost:8000/docs
2. Click on "POST /api/v1/upload/weekly-plan"
3. Click "Try it out"
4. Upload your Excel file
5. Fill in week_start: `2025-07-07`
6. Click "Execute"

---

## 🔍 View Your Data

### Check Routes
```bash
curl "http://localhost:8000/api/v1/weekly/routes?week_start=2025-07-07"
```

### Check Drivers
```bash
curl "http://localhost:8000/api/v1/weekly/drivers?week_start=2025-07-07"
```

### Check Availability
```bash
curl "http://localhost:8000/api/v1/weekly/availability?week_start=2025-07-07"
```

### Get Summary
```bash
curl "http://localhost:8000/api/v1/weekly/summary?week_start=2025-07-07"
```

---

## 🎯 For LibreChat Integration

Your upload endpoint is ready at:

```
POST http://localhost:8000/api/v1/upload/weekly-plan
```

**Required Parameters:**
- `file`: Excel file
- `week_start`: Date (YYYY-MM-DD format)

**Optional Parameters:**
- `action`: "replace" or "append" (default: "replace")
- `unavailable_drivers`: JSON array

**Example Action Configuration for LibreChat:**

```json
{
  "name": "Upload Weekly Schedule",
  "url": "http://localhost:8000/api/v1/upload/weekly-plan",
  "method": "POST",
  "parameters": {
    "file": "{{file}}",
    "week_start": "{{week_start}}",
    "action": "replace"
  }
}
```

---

## 🐛 Common Issues

### "Database connection failed"
- Check your DATABASE_URL in .env
- Make sure Supabase project is running
- Test connection: `psql [YOUR_DATABASE_URL]`

### "Module not found"
- Make sure virtual environment is activated
- Run `pip install -r requirements.txt` again

### "File not found"
- Check UPLOAD_DIR in settings (default: ./uploads)
- Make sure directory exists: `mkdir uploads`

### "Excel parsing failed"
- Ensure sheets are named: Dienste, Lenker, Feiertag, Dienstplan
- Check that columns are in correct order
- Verify it's .xlsx or .xls format

---

## 📊 Understanding the Response

When you upload successfully, you'll get:

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

This means:
- ✅ File processed successfully
- 📅 Week of July 7, 2025
- ☀️ Summer season with school
- 📝 Created 15 driver records, 120 routes, etc.

---

## 🚀 Next Steps

1. **Test with your actual Excel file**
   - Upload and verify data looks correct
   - Check routes, drivers, availability in Supabase

2. **Integrate with LibreChat**
   - Use the upload endpoint URL
   - Configure action parameters

3. **Build Frontend** (Optional)
   - React app to visualize data
   - Drag-drop file upload
   - Weekly schedule view

4. **Connect to OR-Tools Backend**
   - Query uploaded data
   - Run optimization
   - Generate schedules

---

## 💡 Tips

- Use `action=append` if you want to keep old data
- Use `action=replace` to start fresh each week
- Check `/api/v1/upload/history` to see past uploads
- View detailed API docs at `/docs`
- Monitor logs for debugging

---

## 📞 Need Help?

- Check logs in terminal where backend is running
- View Supabase logs in dashboard
- Use `/health` endpoint to check status
- Try test script: `python test_upload.py`

---

## ✅ Checklist

- [ ] Supabase project created
- [ ] Database migrations run successfully
- [ ] .env file configured with credentials
- [ ] Backend running on http://localhost:8000
- [ ] Health check returns "healthy"
- [ ] Successfully uploaded first Excel file
- [ ] Data visible in Supabase database
- [ ] API endpoints working

---

**🎉 You're all set! Your weekly planning upload system is ready to use.**