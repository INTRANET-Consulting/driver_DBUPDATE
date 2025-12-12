from fastapi import APIRouter, Depends, HTTPException, Query, status
from datetime import date, timedelta
import asyncpg
from typing import List
import asyncio
import time

from database.connection import get_db
from services.database_service import DatabaseService
from schemas.models import (
    WeeklyRoutesResponse, WeeklyDriversResponse, WeeklyAvailabilityResponse,
    Route, Driver, DriverAvailability, FixedAssignment,
    DriverCreateRequest, DriverUpdateRequest,
    RouteCreateRequest, RouteUpdateRequest,
    AvailabilityCreateRequest, AvailabilityUpdateRequest,
    FixedAssignmentCreateRequest
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


@router.patch("/routes/{route_id}", response_model=Route)
async def update_route(
    route_id: int,
    payload: RouteUpdateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Update a route's metadata"""
    update_payload = {}
    if payload.route_name:
        update_payload["route_name"] = payload.route_name
    if payload.date:
        update_payload["date"] = payload.date
    if payload.day_of_week:
        update_payload["day_of_week"] = payload.day_of_week
    if payload.details:
        details_payload = payload.details.dict(exclude_unset=True)
        if details_payload:
            update_payload["details"] = details_payload
    if not update_payload:
        raise HTTPException(status_code=400, detail="No update fields supplied")
    db_service = DatabaseService(conn)
    try:
        updated = await db_service.update_route(route_id, update_payload)
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail="Route with the same date/name already exists"
        )
    if not updated:
        raise HTTPException(status_code=404, detail="Route not found")
    return Route(**updated)


@router.post("/routes", response_model=Route, status_code=status.HTTP_201_CREATED)
async def create_route(
    payload: RouteCreateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Create a new route entry"""
    db_service = DatabaseService(conn)
    details_payload = payload.details.dict(exclude_unset=True) if payload.details else {}
    route_id = await db_service.create_route({
        "date": payload.date,
        "route_name": payload.route_name,
        "day_of_week": payload.day_of_week,
        "details": details_payload
    })
    route = await db_service.get_route_by_id(route_id)
    if not route:
        raise HTTPException(status_code=500, detail="Failed to persist route")
    return Route(**route)


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: int,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Delete a route"""
    db_service = DatabaseService(conn)
    try:
        deleted = await db_service.delete_route(route_id)
    except asyncpg.ForeignKeyViolationError:
        # Route is referenced by a fixed assignment; surface a clear message to the UI
        raise HTTPException(
            status_code=409,
            detail="Cannot delete this route because it is assigned to a driver as a fixed route. Edit or remove that assignment first."
        )
    if not deleted:
        raise HTTPException(status_code=404, detail="Route not found")


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
            updated_at=driver_data.get('updated_at', driver_data['created_at'])  # ✅ Use created_at as fallback
        ))
    
    return WeeklyDriversResponse(
        week_start=week_start,
        drivers=drivers
    )


@router.post("/drivers", response_model=Driver, status_code=status.HTTP_201_CREATED)
async def create_driver(
    payload: DriverCreateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Create a driver from the UI"""
    db_service = DatabaseService(conn)
    driver_id = await db_service.upsert_driver({
        "name": payload.name,
        "details": payload.details.dict(exclude_unset=True) if payload.details else {}
    })
    driver = await db_service.get_driver_by_id(driver_id)
    if not driver:
        raise HTTPException(status_code=500, detail="Failed to persist driver")
    return Driver(**driver)


@router.patch("/drivers/{driver_id}", response_model=Driver)
async def update_driver(
    driver_id: int,
    payload: DriverUpdateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Update driver metadata"""
    db_service = DatabaseService(conn)
    update_payload = {}
    if payload.name:
        update_payload["name"] = payload.name
    if payload.details:
        details_payload = payload.details.dict(exclude_unset=True)
        if details_payload:
            update_payload["details"] = details_payload
    if not update_payload:
        raise HTTPException(status_code=400, detail="No update fields supplied")
    updated = await db_service.update_driver(driver_id, update_payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Driver not found")
    return Driver(**updated)


@router.delete("/drivers/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_driver(
    driver_id: int,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Delete a driver"""
    db_service = DatabaseService(conn)
    deleted = await db_service.delete_driver(driver_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Driver not found")


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
    
    start_time = time.time()
    print(f"📋 [AVAILABILITY] Starting fetch for week: {week_start}")
    
    db_service = DatabaseService(conn)
    
    try:
        # Add timeout wrapper - 90 seconds
        availability_data = await asyncio.wait_for(
            db_service.get_availability_for_week(week_start),
            timeout=90.0
        )
        
        elapsed = time.time() - start_time
        print(f"✅ [AVAILABILITY] Query completed in {elapsed:.2f}s, found {len(availability_data)} records")
        
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
        
    except asyncio.TimeoutError:
        elapsed = time.time() - start_time
        print(f"❌ [AVAILABILITY] Query TIMED OUT after {elapsed:.2f}s")
        
        raise HTTPException(
            status_code=504,
            detail={
                "error": "Database query timeout",
                "message": f"Query took longer than 90 seconds. This indicates too many records or missing indexes.",
                "elapsed_time": f"{elapsed:.1f}s",
                "week_start": str(week_start),
                "suggestion": "Check /api/v1/weekly/diagnostics?week_start=" + str(week_start)
            }
        )
        
    except Exception as e:
        elapsed = time.time() - start_time
        import traceback
        error_trace = traceback.format_exc()
        
        print(f"❌ [AVAILABILITY] Error after {elapsed:.2f}s:")
        print(error_trace)
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch availability: {str(e)}"
        )


@router.post("/availability", response_model=DriverAvailability, status_code=status.HTTP_201_CREATED)
async def create_availability_record(
    payload: AvailabilityCreateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Create availability row manually"""
    db_service = DatabaseService(conn)
    try:
        avail_id = await db_service.create_availability(payload.dict())
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail="Availability already exists for that driver and date"
        )
    record = await db_service.get_availability_by_id(avail_id)
    if not record:
        raise HTTPException(status_code=500, detail="Failed to persist availability")
    return DriverAvailability(**record)


@router.patch("/availability/{availability_id}", response_model=DriverAvailability)
async def update_availability_record(
    availability_id: int,
    payload: AvailabilityUpdateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Update manual availability rows"""
    fields = payload.dict(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No update fields supplied")
    db_service = DatabaseService(conn)
    try:
        updated = await db_service.update_availability_record(availability_id, fields)
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail="Availability already exists for that driver and date"
        )
    if not updated:
        raise HTTPException(status_code=404, detail="Availability row not found")
    return DriverAvailability(**updated)


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


@router.post("/fixed-assignments", response_model=FixedAssignment, status_code=status.HTTP_201_CREATED)
async def create_fixed_assignment(
    payload: FixedAssignmentCreateRequest,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Create a fixed assignment"""
    db_service = DatabaseService(conn)
    try:
        assignment_id = await db_service.create_fixed_assignment(payload.dict())
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail="Assignment already exists for that driver/date/route"
        )
    assignment = await db_service.get_fixed_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=500, detail="Failed to persist assignment")
    return assignment


@router.delete("/fixed-assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fixed_assignment(
    assignment_id: int,
    conn: asyncpg.Connection = Depends(get_db)
):
    """Delete a fixed assignment"""
    db_service = DatabaseService(conn)
    deleted = await db_service.delete_fixed_assignment(assignment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Fixed assignment not found")


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
    
    # Get all data (but skip availability if it times out)
    routes = await db_service.get_routes_for_week(week_start)
    drivers = await db_service.get_all_drivers()
    fixed_assignments = await db_service.get_fixed_assignments_for_week(week_start)
    
    # Try to get availability, but don't fail if it times out
    try:
        availability = await asyncio.wait_for(
            db_service.get_availability_for_week(week_start),
            timeout=30.0
        )
        unavailable_count = sum(1 for a in availability if not a['available'])
    except:
        availability = []
        unavailable_count = 0
    
    # Calculate stats
    total_routes = len(routes)
    total_drivers = len(drivers)
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


@router.get("/diagnostics")
async def get_diagnostics(
    week_start: date = Query(None, description="Week start date (optional)"),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    🔍 DIAGNOSTIC ENDPOINT - Use this to troubleshoot timeout issues
    
    This will tell you:
    - How many records exist
    - If there are duplicates
    - Query performance metrics
    """
    try:
        results = {
            "timestamp": str(time.time()),
            "query_times": {},
            "counts": {},
            "issues": []
        }
        
        # 1. Count total records
        start = time.time()
        results["counts"]["total_drivers"] = await conn.fetchval("SELECT COUNT(*) FROM drivers")
        results["counts"]["total_routes"] = await conn.fetchval("SELECT COUNT(*) FROM routes")
        results["counts"]["total_availability"] = await conn.fetchval("SELECT COUNT(*) FROM driver_availability")
        results["counts"]["total_fixed_assignments"] = await conn.fetchval("SELECT COUNT(*) FROM fixed_assignments")
        results["query_times"]["total_counts"] = f"{time.time() - start:.3f}s"
        
        # 2. If week provided, check that week
        if week_start:
            week_end = week_start + timedelta(days=7)
            results["week_start"] = str(week_start)
            
            start = time.time()
            week_avail = await conn.fetchval(
                "SELECT COUNT(*) FROM driver_availability WHERE date >= $1 AND date < $2",
                week_start, week_end
            )
            results["counts"]["availability_this_week"] = week_avail
            results["counts"]["expected_this_week"] = results["counts"]["total_drivers"] * 7
            results["query_times"]["week_count"] = f"{time.time() - start:.3f}s"
            
            # Check duplicates
            start = time.time()
            dup_count = await conn.fetchval("""
                SELECT COUNT(*) FROM (
                    SELECT driver_id, date
                    FROM driver_availability
                    WHERE date >= $1 AND date < $2
                    GROUP BY driver_id, date
                    HAVING COUNT(*) > 1
                ) as dups
            """, week_start, week_end)
            results["counts"]["duplicates_this_week"] = dup_count
            results["query_times"]["duplicate_check"] = f"{time.time() - start:.3f}s"
            
            # Try the actual problematic query
            start = time.time()
            try:
                test_query = await asyncio.wait_for(
                    conn.fetch("""
                        SELECT COUNT(*) as cnt
                        FROM driver_availability da
                        INNER JOIN drivers d ON da.driver_id = d.driver_id
                        WHERE da.date >= $1 AND da.date < $2
                    """, week_start, week_end),
                    timeout=15.0
                )
                results["query_times"]["join_query_test"] = f"{time.time() - start:.3f}s"
                results["join_query_works"] = True
            except asyncio.TimeoutError:
                results["query_times"]["join_query_test"] = "TIMEOUT (>15s)"
                results["join_query_works"] = False
                results["issues"].append("JOIN query is timing out - this is the root cause")
        
        # Analysis
        if results["counts"]["total_availability"] > 50000:
            results["issues"].append(f"Too many total availability records: {results['counts']['total_availability']}")
        
        if week_start and week_avail > results["counts"]["total_drivers"] * 7 * 2:
            results["issues"].append(f"Too many records for this week: {week_avail} (expected ~{results['counts']['total_drivers'] * 7})")
        
        if week_start and dup_count > 0:
            results["issues"].append(f"Found {dup_count} duplicate records for this week")
        
        return results
        
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
