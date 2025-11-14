# 🤖 LibreChat Integration Guide

Complete guide to integrate the upload system with LibreChat.

---

## 🎯 Overview

LibreChat will use the upload endpoint to send Excel files for processing. Users can chat with Claude and upload files directly in the conversation.

**Endpoint:**
```
POST http://localhost:8000/api/v1/upload/weekly-plan
```

---

## 📋 Step-by-Step Integration

### Step 1: Ensure Backend is Running

```bash
# Start your upload backend
cd backend
python main.py

# Should show:
# 🚀 Starting Driver Scheduling Upload System...
# ✅ Database connected
# INFO: Uvicorn running on http://0.0.0.0:8000
```

### Step 2: Test Endpoint Manually

```bash
# Test health
curl http://localhost:8000/health

# Should return: {"status":"healthy","database":"connected"}
```

### Step 3: Configure LibreChat Action

In LibreChat, create a new action with these settings:

---

## ⚙️ Action Configuration

### Basic Settings

```yaml
Name: Upload Weekly Schedule
Description: Upload Excel file with weekly driver planning data
Endpoint: http://localhost:8000/api/v1/upload/weekly-plan
Method: POST
Content-Type: multipart/form-data
```

### Parameters

**Required:**
```json
{
  "file": {
    "type": "file",
    "description": "Excel file with 4 sheets (Dienste, Lenker, Feiertag, Dienstplan)",
    "required": true,
    "accept": ".xlsx,.xls"
  },
  "week_start": {
    "type": "string",
    "description": "Week start date (Monday) in YYYY-MM-DD format",
    "required": true,
    "format": "date",
    "example": "2025-07-07"
  }
}
```

**Optional:**
```json
{
  "action": {
    "type": "string",
    "description": "Replace old data or append to existing",
    "required": false,
    "default": "replace",
    "enum": ["replace", "append"]
  },
  "unavailable_drivers": {
    "type": "string",
    "description": "JSON array of unavailable drivers",
    "required": false,
    "default": "[]",
    "example": "[{\"driver_name\":\"Name\",\"dates\":[\"2025-07-07\"]}]"
  }
}
```

---

## 💬 Example Chat Interactions

### Example 1: Basic Upload

**User:**
```
Upload this Excel file for the week starting July 7, 2025
[Attaches: weekly_plan.xlsx]
```

**LibreChat Action:**
```
POST /api/v1/upload/weekly-plan
file: weekly_plan.xlsx
week_start: 2025-07-07
action: replace
```

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
  "message": "Successfully processed weekly_plan.xlsx"
}
```

**Claude Reply:**
```
✅ Successfully uploaded your weekly schedule!

📅 Week: July 7-13, 2025
☀️ Season: Summer (with school)

Records created:
• 15 drivers
• 120 routes
• 75 availability entries
• 30 fixed assignments

Your data is now ready for optimization. Would you like me to:
1. Show routes for a specific day
2. Check driver availability
3. Run the OR-Tools optimizer
```

---

### Example 2: Upload with Unavailable Drivers

**User:**
```
Upload the planning file for next week (July 14).
Mark Merz Matthias as unavailable on Monday and Tuesday,
and Grandler Hermann unavailable the entire week.
[Attaches: plan_week28.xlsx]
```

**LibreChat Action:**
```
POST /api/v1/upload/weekly-plan
file: plan_week28.xlsx
week_start: 2025-07-14
action: replace
unavailable_drivers: [
  {
    "driver_name": "Merz, Matthias",
    "dates": ["2025-07-14", "2025-07-15"],
    "reason": "Personal"
  },
  {
    "driver_name": "Grandler, Hermann",
    "dates": ["2025-07-14", "2025-07-15", "2025-07-16", "2025-07-17", "2025-07-18"],
    "reason": "Vacation"
  }
]
```

**Claude Reply:**
```
✅ Schedule uploaded for week of July 14, 2025

⚠️ Unavailability applied:
• Merz, Matthias: Mon-Tue (Personal)
• Grandler, Hermann: Mon-Fri (Vacation)

📊 Summary:
• 118 routes (2 routes affected by unavailability)
• 13 available drivers (2 unavailable)
• Summer season with school

Ready to optimize?
```

---

### Example 3: Append Mode

**User:**
```
I have additional routes for this week. Upload this file
but keep the existing data.
[Attaches: additional_routes.xlsx]
```

**LibreChat Action:**
```
POST /api/v1/upload/weekly-plan
file: additional_routes.xlsx
week_start: 2025-07-07
action: append
```

---

## 🔍 Querying Uploaded Data

After uploading, users can query the data:

### Example Queries

**User:** "Show me all routes for Monday"

**Claude uses:**
```
GET /api/v1/weekly/routes?week_start=2025-07-07
```

**Claude Reply:**
```
📅 Monday, July 7, 2025 Routes:

1. Route 401mS - Leiten
   • Departure: 10:53
   • Duration: 11 hours
   • Diäten: 11

2. Route 402mS - Oberglan
   • Departure: 11:19
   • Duration: 9 hours
   • Diäten: 9

[... continues ...]
```

---

**User:** "Who's unavailable this week?"

**Claude uses:**
```
GET /api/v1/weekly/availability?week_start=2025-07-07
```

**Claude Reply:**
```
❌ Unavailable Drivers (July 7-13):

Monday (July 7):
• All drivers - Feiertag: Neujahr
• Merz, Matthias - Personal

Tuesday (July 8):
• Fröhlacher, Hubert - Krankenstand

[... continues ...]
```

---

**User:** "What are the fixed assignments?"

**Claude uses:**
```
GET /api/v1/weekly/fixed-assignments?week_start=2025-07-07
```

---

## 🛠️ Action Implementation Options

### Option A: Direct REST API Call

LibreChat makes direct HTTP request to your backend:

```javascript
// LibreChat action config
{
  "name": "upload_schedule",
  "url": "http://localhost:8000/api/v1/upload/weekly-plan",
  "method": "POST",
  "parameters": {
    "file": "{{file}}",
    "week_start": "{{week_start}}",
    "action": "{{action}}",
    "unavailable_drivers": "{{unavailable_drivers}}"
  }
}
```

### Option B: Proxy Through LibreChat Backend

If you need authentication or additional processing:

```javascript
// LibreChat custom endpoint
app.post('/api/schedule/upload', async (req, res) => {
  const formData = new FormData();
  formData.append('file', req.file);
  formData.append('week_start', req.body.week_start);
  formData.append('action', req.body.action);
  
  const response = await fetch(
    'http://localhost:8000/api/v1/upload/weekly-plan',
    {
      method: 'POST',
      body: formData
    }
  );
  
  res.json(await response.json());
});
```

---

## 🔐 Security Considerations

### For Local Development

```yaml
FRONTEND_URL=http://localhost:3000
# Allow LibreChat to call API
```

### For Production

1. **Add Authentication**
```python
# In main.py
from fastapi.security import HTTPBearer

security = HTTPBearer()

@app.post("/api/v1/upload/weekly-plan")
async def upload(token: str = Depends(security)):
    # Verify token
    pass
```

2. **Use API Keys**
```python
API_KEY_HEADER = "X-API-Key"

def verify_api_key(api_key: str = Header(...)):
    if api_key != settings.API_KEY:
        raise HTTPException(401, "Invalid API key")
```

3. **Limit File Size**
```python
# Already configured in settings
MAX_FILE_SIZE = 10MB
```

4. **Rate Limiting**
```python
from slowapi import Limiter

limiter = Limiter(key_func=lambda: "global")
app.state.limiter = limiter

@app.post("/api/v1/upload/weekly-plan")
@limiter.limit("10/hour")
async def upload():
    pass
```

---

## 📊 Response Handling

### Success Response

```python
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

**LibreChat should display:**
- ✅ Success message
- 📅 Week and season
- 📊 Statistics in friendly format
- Next action suggestions

---

### Error Response

```python
{
  "detail": "Processing failed: Sheet 'Dienste' not found"
}
```

**LibreChat should display:**
- ❌ Error message
- 💡 Suggestions to fix
- Option to retry

---

## 🧪 Testing the Integration

### Test 1: Basic Upload

```bash
# Test with curl
curl -X POST "http://localhost:8000/api/v1/upload/weekly-plan" \
  -F "file=@test_plan.xlsx" \
  -F "week_start=2025-07-07" \
  -F "action=replace"
```

### Test 2: With Unavailability

```bash
curl -X POST "http://localhost:8000/api/v1/upload/weekly-plan" \
  -F "file=@test_plan.xlsx" \
  -F "week_start=2025-07-07" \
  -F "action=replace" \
  -F 'unavailable_drivers=[{"driver_name":"Test Driver","dates":["2025-07-07"]}]'
```

### Test 3: Query After Upload

```bash
# Get routes
curl "http://localhost:8000/api/v1/weekly/routes?week_start=2025-07-07"

# Get summary
curl "http://localhost:8000/api/v1/weekly/summary?week_start=2025-07-07"
```

---

## 🎯 User Experience Flow

1. **User uploads file in chat**
   ```
   User: Upload this schedule for next week
   [Attaches: plan.xlsx]
   ```

2. **Claude extracts week_start**
   ```
   Claude: What's the start date? (Monday)
   User: July 7
   ```

3. **Claude calls action**
   ```
   Action: POST /upload with file + week_start
   ```

4. **Claude presents results**
   ```
   Claude: ✅ Uploaded! 120 routes, 15 drivers.
           Ready for optimization?
   ```

5. **User can query**
   ```
   User: Show Monday routes
   Claude: [calls GET /weekly/routes]
   ```

6. **User can optimize**
   ```
   User: Run the optimizer
   Claude: [calls your OR-Tools backend]
   ```

---

## 📝 Configuration Template for LibreChat

Save this as `schedule_upload_action.json`:

```json
{
  "name": "Upload Weekly Schedule",
  "description": "Upload Excel file with weekly driver planning",
  "endpoint": {
    "url": "http://localhost:8000/api/v1/upload/weekly-plan",
    "method": "POST",
    "contentType": "multipart/form-data"
  },
  "parameters": {
    "file": {
      "type": "file",
      "required": true,
      "accept": ".xlsx,.xls"
    },
    "week_start": {
      "type": "string",
      "required": true,
      "format": "date",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "action": {
      "type": "string",
      "required": false,
      "default": "replace",
      "enum": ["replace", "append"]
    },
    "unavailable_drivers": {
      "type": "string",
      "required": false,
      "default": "[]"
    }
  },
  "response": {
    "success": "boolean",
    "week_start": "string",
    "season": "string",
    "school_status": "string",
    "records_created": "object"
  }
}
```

---

## ✅ Integration Checklist

- [ ] Backend running on port 8000
- [ ] Health check returns healthy
- [ ] Test upload works via curl
- [ ] LibreChat action configured
- [ ] File upload works in chat
- [ ] week_start parameter extracted correctly
- [ ] Response displayed nicely
- [ ] Error handling works
- [ ] Query endpoints accessible
- [ ] Integration with OR-Tools backend

---

## 🚀 Next Steps

1. Configure the action in LibreChat
2. Test with sample Excel file
3. Verify data in database
4. Connect to OR-Tools optimizer
5. Build frontend for visualization

---

**🎉 Your LibreChat integration is ready!**

Users can now upload schedules directly in chat and get instant processing.