from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import JSONResponse
from datetime import date, datetime, timedelta
from typing import Optional, List
import asyncpg
import os
import aiofiles
from pathlib import Path

from database.connection import get_db
from services.excel_parser import ExcelParser
from services.database_service import DatabaseService
from services.google_sheets_service import google_sheets_service
from schemas.models import UploadResponse, UnavailableDriver
from config.settings import settings
import json

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])


@router.post("/weekly-plan", response_model=UploadResponse)
async def upload_weekly_plan(
    file: UploadFile = File(...),
    week_start: str = Form(...),  # ISO format: YYYY-MM-DD
    action: str = Form(default="replace"),  # "replace" or "append"
    unavailable_drivers: Optional[str] = Form(default="[]"),  # JSON string
    sync_to_google_sheets: Optional[bool] = Form(default=True),  # Enable/disable sync
    google_sheet_name: Optional[str] = Form(default=None),  # Override sheet name
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Upload weekly planning Excel file and populate database.
    
    This endpoint is designed for LibreChat integration.
    
    Parameters:
    - file: Excel file with 4 sheets (Dienste, Lenker, Feiertag, Dienstplan)
    - week_start: Start date of the week (MUST BE A MONDAY, ISO format: YYYY-MM-DD)
    - action: "replace" (clear old data) or "append" (keep old data)
    - unavailable_drivers: JSON array of manually set unavailable drivers
      Format: [{"driver_name": "Name", "dates": ["YYYY-MM-DD", ...], "reason": "optional"}]
    - sync_to_google_sheets: Whether to sync to Google Sheets (default: True)
    - google_sheet_name: Override the Google Sheet name (optional)
    
    Returns:
    - Success status, week info, season, records created
    """
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls', '.xlsm')):
        raise HTTPException(status_code=400, detail="File must be Excel format (.xlsx, .xls, or .xlsm)")
    
    # Parse week_start
    try:
        week_start_date = date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(status_code=400, detail="week_start must be ISO format (YYYY-MM-DD)")
    
    # CRITICAL: Validate that week_start is a Monday
    if week_start_date.weekday() != 0:  # Monday is 0
        # Calculate the nearest Monday
        days_since_monday = week_start_date.weekday()
        nearest_previous_monday = week_start_date - timedelta(days=days_since_monday)
        nearest_next_monday = week_start_date + timedelta(days=(7 - days_since_monday))
        
        day_name = week_start_date.strftime('%A')
        
        raise HTTPException(
            status_code=400,
            detail={
                "error": "week_start must be a Monday",
                "provided_date": week_start,
                "provided_day": day_name,
                "message": f"The date you provided ({week_start}) is a {day_name}, not a Monday.",
                "suggestions": {
                    "previous_monday": nearest_previous_monday.isoformat(),
                    "next_monday": nearest_next_monday.isoformat()
                },
                "hint": f"Please use {nearest_previous_monday.isoformat()} (previous Monday) or {nearest_next_monday.isoformat()} (next Monday)"
            }
        )
    
    # Validate action
    if action not in ['replace', 'append']:
        raise HTTPException(status_code=400, detail="action must be 'replace' or 'append'")
    
    # Parse unavailable drivers
    try:
        unavailable_list = json.loads(unavailable_drivers) if unavailable_drivers else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="unavailable_drivers must be valid JSON")
    
    # Save uploaded file temporarily
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(exist_ok=True)
    
    file_path = upload_dir / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            
            # Check file size
            if len(content) > settings.MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large. Max size: {settings.MAX_FILE_SIZE / 1024 / 1024}MB"
                )
            
            await f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Initialize database service
    db_service = DatabaseService(conn)
    
    # Track Google Sheets sync result
    google_sheets_result = None
    
    try:
        # === GOOGLE SHEETS SYNC (BEFORE DATABASE PROCESSING) ===
        if sync_to_google_sheets and settings.ENABLE_GOOGLE_SHEETS_SYNC:
            print("\n" + "="*60)
            print("📊 GOOGLE SHEETS SYNC")
            print("="*60)
            
            if google_sheets_service.is_available():
                google_sheets_result = await google_sheets_service.upload_excel_to_sheet(
                    str(file_path),
                    sheet_name=google_sheet_name
                )
                
                if google_sheets_result:
                    print("✅ Google Sheets sync completed successfully")
                else:
                    print("⚠️  Google Sheets sync failed, but continuing with database processing")
            else:
                print("⚠️  Google Sheets service not available - skipping sync")
            
            print("="*60 + "\n")
        else:
            print("ℹ️  Google Sheets sync disabled for this upload")
        
        # === DATABASE PROCESSING ===
        # Parse Excel file
        print(f"📄 Parsing Excel file: {file.filename}")
        parser = ExcelParser(str(file_path))
        parsed_data = parser.parse_all(week_start_date)
        
        # Determine season and school status
        season, school_status = _determine_season_and_school(
            week_start_date,
            parsed_data['school_days']
        )
        
        print(f"📅 Week: {week_start_date}, Season: {season}, School: {school_status}")
        
        # ALWAYS clear ALL existing data and reset sequences
        print("🗑️  Clearing ALL existing data from database...")
        await db_service.clear_all_week_data()
        print("✅ Database cleared and sequences reset")
        
        # Track records created
        records_created = {
            'drivers': 0,
            'routes': 0,
            'driver_availability': 0,
            'fixed_assignments': 0
        }
        
        # 1. Insert/Update Drivers
        print("👥 Inserting/updating drivers...")
        driver_id_map = {}  # Map driver name to driver_id
        for driver_data in parsed_data['drivers']:
            driver_id = await db_service.upsert_driver(driver_data)
            driver_id_map[driver_data['name']] = driver_id
            records_created['drivers'] += 1
        
        print(f"✅ Created/updated {records_created['drivers']} drivers")
        
        # 2. Insert Routes
        print("🚌 Inserting routes...")
        route_id_map = {}  # Map (route_name, date) to route_id
        for route_data in parsed_data['routes']:
            route_id = await db_service.create_route(route_data)
            key = (route_data['route_name'], route_data['date'])
            route_id_map[key] = route_id
            records_created['routes'] += 1
        
        print(f"✅ Created {records_created['routes']} routes")
        
        # 3. Process Public Holidays - mark all drivers unavailable
        print("🎉 Processing public holidays...")
        for holiday in parsed_data['public_holidays']:
            # Only add if within the week
            if week_start_date <= holiday['date'] < week_start_date + timedelta(days=7):
                for driver_name, driver_id in driver_id_map.items():
                    await db_service.create_availability({
                        'driver_id': driver_id,
                        'date': holiday['date'],
                        'available': False,
                        'notes': f"Feiertag: {holiday['name']}"
                    })
                    records_created['driver_availability'] += 1
        
        # 4. Process Fixed Assignments from parsed data
        print("📌 Processing fixed assignments...")
        for assignment in parsed_data['fixed_assignments']:
            driver_name = assignment['driver_name']
            route_name = assignment['route_name']
            assignment_date = assignment['date']
            
            if driver_name not in driver_id_map:
                print(f"   ⚠️  Driver '{driver_name}' not found - skipping")
                continue
            
            driver_id = driver_id_map[driver_name]
            
            # Get route_id
            route_key = (route_name, assignment_date)
            route_id = route_id_map.get(route_key)
            
            if not route_id:
                print(f"   ⚠️  Route '{route_name}' on {assignment_date} not found - skipping")
                continue
            
            # Insert fixed assignment (NO details column)
            await db_service.create_fixed_assignment({
                'driver_id': driver_id,
                'route_id': route_id,
                'date': assignment_date
            })
            records_created['fixed_assignments'] += 1
        
        print(f"✅ Created {records_created['fixed_assignments']} fixed assignments")
        
        # 5. Process driver availability (frei, manual)
        print("📋 Processing driver availability...")
        
        # First, create a set of (driver_id, date) tuples for unavailable drivers
        unavailable_set = set()
        
        # From parsed data (frei assignments)
        for availability in parsed_data['driver_availability']:
            driver_name = availability['driver_name']
            
            if driver_name not in driver_id_map:
                continue
            
            driver_id = driver_id_map[driver_name]
            
            await db_service.create_availability({
                'driver_id': driver_id,
                'date': availability['date'],
                'available': availability['available'],
                'notes': availability['notes']
            })
            records_created['driver_availability'] += 1
            unavailable_set.add((driver_id, availability['date']))
        
        # Manual unavailability (from user input)
        if unavailable_list:
            for unavailable in unavailable_list:
                driver_name = unavailable.get('driver_name')
                dates = unavailable.get('dates', [])
                reason = unavailable.get('reason', 'Manually set unavailable')
                
                if driver_name not in driver_id_map:
                    print(f"   ⚠️  Driver '{driver_name}' not found - skipping")
                    continue
                
                driver_id = driver_id_map[driver_name]
                
                for date_str in dates:
                    try:
                        unavail_date = date.fromisoformat(date_str)
                        await db_service.create_availability({
                            'driver_id': driver_id,
                            'date': unavail_date,
                            'available': False,
                            'notes': reason
                        })
                        records_created['driver_availability'] += 1
                        unavailable_set.add((driver_id, unavail_date))
                    except ValueError:
                        print(f"   ⚠️  Invalid date format: {date_str}")
                        continue
        
        # Now create availability records for ALL drivers for ALL days in the week
        # Mark as available by default, unless already marked unavailable above
        print("📅 Creating default availability records for all drivers...")
        for driver_name, driver_id in driver_id_map.items():
            for day_offset in range(7):
                current_date = week_start_date + timedelta(days=day_offset)
                
                # Skip if already marked unavailable (holiday, frei, or manual)
                if (driver_id, current_date) in unavailable_set:
                    continue
                
                # Create available record
                await db_service.create_availability({
                    'driver_id': driver_id,
                    'date': current_date,
                    'available': True,
                    'notes': 'Available'
                })
                records_created['driver_availability'] += 1
        
        print(f"✅ Created {records_created['driver_availability']} availability records")
        
        # Clean up uploaded file
        try:
            os.remove(file_path)
        except:
            pass
        
        print(f"🎉 Upload complete!")
        
        # Build response message
        response_message = f"Successfully processed {file.filename}"
        if google_sheets_result:
            response_message += f" and synced to Google Sheet '{google_sheets_result.get('name')}'"
        
        return UploadResponse(
            success=True,
            week_start=week_start_date,
            season=season,
            school_status=school_status,
            records_created=records_created,
            action_taken=action,
            message=response_message
        )
    
    except Exception as e:
        # Clean up file on error
        try:
            os.remove(file_path)
        except:
            pass
        
        # Print full error for debugging
        import traceback
        print(f"❌ Error during upload: {str(e)}")
        print(traceback.format_exc())
        
        # Re-raise as HTTPException
        raise HTTPException(
            status_code=500, 
            detail=f"Processing failed: {str(e)}"
        )


def _determine_season_and_school(week_start: date, school_days: dict) -> tuple:
    """Determine season and school status"""
    month = week_start.month
    
    # Season
    if 6 <= month <= 9:
        season = "summer"
    else:
        season = "winter"
    
    # School status - check if any day in the week is school-free
    school_status = "mit_schule"
    for day_offset in range(7):
        current_date = week_start + timedelta(days=day_offset)
        if current_date in school_days and not school_days[current_date]:
            school_status = "ohne_schule"
            break
    
    return season, school_status