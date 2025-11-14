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
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Upload weekly planning Excel file and populate database.
    
    This endpoint is designed for LibreChat integration.
    
    Parameters:
    - file: Excel file with 4 sheets (Dienste, Lenker, Feiertag, Dienstplan)
    - week_start: Start date of the week (Monday, ISO format: YYYY-MM-DD)
    - action: "replace" (clear old data) or "append" (keep old data)
    - unavailable_drivers: JSON array of manually set unavailable drivers
      Format: [{"driver_name": "Name", "dates": ["YYYY-MM-DD", ...], "reason": "optional"}]
    
    Returns:
    - Success status, week info, season, records created
    """
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="File must be Excel format (.xlsx or .xls)")
    
    # Parse week_start
    try:
        week_start_date = date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(status_code=400, detail="week_start must be ISO format (YYYY-MM-DD)")
    
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
    
    try:
        # Parse Excel file
        parser = ExcelParser(str(file_path))
        parsed_data = parser.parse_all(week_start_date)
        
        # Determine season and school status
        season, school_status = _determine_season_and_school(
            week_start_date,
            parsed_data['school_days']
        )
        
        # Clear existing data if action is "replace"
        if action == "replace":
            await db_service.clear_week_data(week_start_date)
        
        # Track records created
        records_created = {
            'drivers': 0,
            'routes': 0,
            'driver_availability': 0,
            'fixed_assignments': 0
        }
        
        # 1. Insert/Update Drivers
        driver_id_map = {}  # Map driver name to driver_id
        for driver_data in parsed_data['drivers']:
            driver_id = await db_service.upsert_driver(driver_data)
            driver_id_map[driver_data['name']] = driver_id
            records_created['drivers'] += 1
        
        # 2. Insert Routes
        route_id_map = {}  # Map (route_name, date) to route_id
        for route_data in parsed_data['routes']:
            route_id = await db_service.create_route(route_data)
            key = (route_data['route_name'], route_data['date'])
            route_id_map[key] = route_id
            records_created['routes'] += 1
        
        # 3. Insert Availability - Public Holidays (all drivers)
        for holiday in parsed_data['public_holidays']:
            for driver_name, driver_id in driver_id_map.items():
                # Only add if within the week
                if week_start_date <= holiday['date'] < week_start_date + timedelta(days=7):
                    await db_service.create_availability({
                        'driver_id': driver_id,
                        'date': holiday['date'],
                        'available': False,
                        'notes': f"Feiertag: {holiday['name']}"
                    })
                    records_created['driver_availability'] += 1
        
        # 4. Insert Fixed Assignments & "frei" Availability
        for driver_data in parsed_data['drivers']:
            driver_id = driver_id_map[driver_data['name']]
            
            # Determine which fixed route applies
            if school_status == 'mit_schule':
                fixed_route = driver_data['details'].get('fixed_route_with_school')
            else:
                fixed_route = driver_data['details'].get('fixed_route_without_school')
            
            if not fixed_route:
                continue
            
            # Handle "frei" - mark unavailable
            if fixed_route.lower() == 'frei':
                for day_offset in range(7):
                    current_date = week_start_date + timedelta(days=day_offset)
                    # Only mark weekdays (Mon-Fri) as unavailable
                    if current_date.weekday() < 5:
                        await db_service.create_availability({
                            'driver_id': driver_id,
                            'date': current_date,
                            'available': False,
                            'notes': f'Fixdienst: frei ({school_status})'
                        })
                        records_created['driver_availability'] += 1
                continue
            
            # Handle special duties (MB, DI, SOF)
            if fixed_route in ['MB', 'DI', 'SOF']:
                for day_offset in range(7):
                    current_date = week_start_date + timedelta(days=day_offset)
                    if current_date.weekday() < 5:  # Mon-Fri
                        await db_service.create_fixed_assignment({
                            'driver_id': driver_id,
                            'route_id': None,
                            'date': current_date,
                            'details': {
                                'type': 'special_duty',
                                'duty_code': fixed_route,
                                'duty_name': _get_duty_name(fixed_route),
                                'blocks_regular_assignment': True
                            }
                        })
                        records_created['fixed_assignments'] += 1
                continue
            
            # Handle combined routes (e.g., "411 + 412")
            route_parts = [r.strip() for r in fixed_route.split('+')]
            
            for day_offset in range(7):
                current_date = week_start_date + timedelta(days=day_offset)
                
                # Only assign on weekdays
                if current_date.weekday() >= 5:
                    continue
                
                # Create assignment for each route part
                for route_name in route_parts:
                    route_key = (route_name, current_date)
                    route_id = route_id_map.get(route_key)
                    
                    if route_id:
                        await db_service.create_fixed_assignment({
                            'driver_id': driver_id,
                            'route_id': route_id,
                            'date': current_date,
                            'details': {
                                'type': 'regular',
                                'additional_routes': [r for r in route_parts if r != route_name]
                            }
                        })
                        records_created['fixed_assignments'] += 1
        
        # 5. Apply Manual Unavailability (from user input)
        for unavailable in unavailable_list:
            driver_name = unavailable.get('driver_name')
            dates = unavailable.get('dates', [])
            reason = unavailable.get('reason', 'Manually set unavailable')
            
            if driver_name not in driver_id_map:
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
                except ValueError:
                    continue
        
        # Clean up uploaded file
        try:
            os.remove(file_path)
        except:
            pass
        
        return UploadResponse(
            success=True,
            week_start=week_start_date,
            season=season,
            school_status=school_status,
            records_created=records_created,
            action_taken=action,
            message=f"Successfully processed {file.filename}"
        )
    
    except Exception as e:
        # Clean up file on error
        try:
            os.remove(file_path)
        except:
            pass
        
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


def _get_duty_name(code: str) -> str:
    """Get duty name from code"""
    mapping = {
        'MB': 'Mobilbüro',
        'DI': 'Dispo',
        'SOF': 'Sonderfahrt'
    }
    return mapping.get(code, code)