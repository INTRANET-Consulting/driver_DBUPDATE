from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import date
import asyncpg
from typing import List

from database.connection import get_db
from services.database_service import DatabaseService
from schemas.models import (
    WeeklyRoutesResponse, WeeklyDriversResponse, WeeklyAvailabilityResponse,
    Route, Driver, DriverAvailability
)

router = APIRouter(prefix="/api/v1/weekly", tags=["weekly_data"])


@router.get("/routes", response_model=WeeklyRoutesResponse)
async def get_weekly_routes(
    week_start: date = Query(..., description="Week start date (Monday, ISO format)"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Get all routes for a specific week.
    
    Returns routes with details including:
    - Route name, date, day of week
    - Duration, Diäten, VAD time, location
    - Season and school status
    """
    
    db_service = DatabaseService(conn)
    
    # Get routes
    routes_data = await db_service.get_routes_for_week(week_start)
    
    if not routes_data:
        return WeeklyRoutesResponse(
            week_start=week_start,
            season="unknown",
            school_status="unknown",
            routes=[]
        )
    
    # Extract season and school status from first route
    season = "unknown"
    school_status = "unknown"
    
    if routes_data and 'details' in routes_data[0]:
        details = routes_data[0]['details']
        season = details.get('season', 'unknown')
        school_status = details.get('school_status', 'unknown')
    
    # Convert to Route models
    routes = []
    for route_data in routes_data:
        routes.append(Route(
            route_id=route_data['route_id'],
            date=route_data['date'],
            route_name=route_data['route_name'],
            day_of_week=route_data['day_of_week'],
            details=route_data['details'],
            created_at=route_data['created_at']
        ))
    
    return WeeklyRoutesResponse(
        week_start=week_start,
        season=season,
        school_status=school_status,
        routes=routes
    )


@router.get("/drivers", response_model=WeeklyDriversResponse)
async def get_weekly_drivers(
    week_start: date = Query(..., description="Week start date"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Get all drivers with their details for a specific week.
    
    Includes:
    - Monthly hours target and remaining
    - Fixed route assignments
    - Employment percentage
    """
    
    db_service = DatabaseService(conn)
    
    # Get all drivers
    drivers_data = await db_service.get_all_drivers()
    
    # Convert to Driver models
    drivers = []
    for driver_data in drivers_data:
        drivers.append(Driver(
            driver_id=driver_data['driver_id'],
            name=driver_data['name'],
            details=driver_data['details'],
            created_at=driver_data['created_at'],
            updated_at=driver_data['updated_at']
        ))
    
    return WeeklyDriversResponse(
        week_start=week_start,
        drivers=drivers
    )


@router.get("/availability", response_model=WeeklyAvailabilityResponse)
async def get_weekly_availability(
    week_start: date = Query(..., description="Week start date"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Get driver availability for a specific week.
    
    Shows which drivers are available/unavailable on each day,
    including reasons (vacation, sick, holiday, etc.)
    """
    
    db_service = DatabaseService(conn)
    
    # Get availability
    availability_data = await db_service.get_availability_for_week(week_start)
    
    # Convert to models
    availability = []
    for avail_data in availability_data:
        availability.append(DriverAvailability(
            id=avail_data['id'],
            driver_id=avail_data['driver_id'],
            date=avail_data['date'],
            available=avail_data['available'],
            notes=avail_data['notes'],
            created_at=avail_data['created_at'],
            updated_at=avail_data['updated_at']
        ))
    
    return WeeklyAvailabilityResponse(
        week_start=week_start,
        availability=availability
    )


@router.get("/fixed-assignments")
async def get_weekly_fixed_assignments(
    week_start: date = Query(..., description="Week start date"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Get fixed assignments for a specific week.
    
    Shows which drivers have fixed routes or special duties.
    """
    
    db_service = DatabaseService(conn)
    
    # Get fixed assignments
    assignments = await db_service.get_fixed_assignments_for_week(week_start)
    
    return {
        "week_start": week_start,
        "fixed_assignments": assignments
    }


@router.get("/summary")
async def get_weekly_summary(
    week_start: date = Query(..., description="Week start date"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Get a summary of all data for a specific week.
    
    Useful for dashboard/overview display.
    """
    
    db_service = DatabaseService(conn)
    
    # Get all data
    routes = await db_service.get_routes_for_week(week_start)
    drivers = await db_service.get_all_drivers()
    availability = await db_service.get_availability_for_week(week_start)
    fixed_assignments = await db_service.get_fixed_assignments_for_week(week_start)
    
    # Calculate stats
    total_routes = len(routes)
    total_drivers = len(drivers)
    unavailable_count = sum(1 for a in availability if not a['available'])
    fixed_assignment_count = len(fixed_assignments)
    
    # Extract season/school status
    season = "unknown"
    school_status = "unknown"
    if routes and 'details' in routes[0]:
        details = routes[0]['details']
        season = details.get('season', 'unknown')
        school_status = details.get('school_status', 'unknown')
    
    return {
        "week_start": week_start,
        "season": season,
        "school_status": school_status,
        "statistics": {
            "total_routes": total_routes,
            "total_drivers": total_drivers,
            "unavailable_instances": unavailable_count,
            "fixed_assignments": fixed_assignment_count
        },
        "routes": routes[:10],  # First 10 routes as preview
        "drivers": [{"driver_id": d['driver_id'], "name": d['name']} for d in drivers]
    }