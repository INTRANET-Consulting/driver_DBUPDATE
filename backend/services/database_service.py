import asyncpg
from typing import List, Dict, Any, Optional
from datetime import date, datetime
from schemas.models import (
    Driver, Route, DriverAvailability, FixedAssignment,
    SeasonConfig, SchoolVacationPeriod, UploadHistory
)
import json


class DatabaseService:
    """Database operations for weekly planning system"""
    
    def __init__(self, connection: asyncpg.Connection):
        self.conn = connection
    
    # ============= DRIVER OPERATIONS =============
    
    async def upsert_driver(self, driver_data: Dict[str, Any]) -> int:
        """Insert or update driver, return driver_id"""
        query = """
            INSERT INTO drivers (name, details)
            VALUES ($1, $2)
            ON CONFLICT (name) 
            DO UPDATE SET 
                details = EXCLUDED.details,
                updated_at = NOW()
            RETURNING driver_id
        """
        
        driver_id = await self.conn.fetchval(
            query,
            driver_data['name'],
            json.dumps(driver_data['details'])
        )
        
        return driver_id
    
    async def get_driver_by_name(self, name: str) -> Optional[Dict]:
        """Get driver by name"""
        query = """
            SELECT driver_id, name, details, created_at, updated_at
            FROM drivers
            WHERE name = $1
        """
        
        row = await self.conn.fetchrow(query, name)
        return dict(row) if row else None
    
    async def get_all_drivers(self) -> List[Dict]:
        """Get all drivers"""
        query = """
            SELECT driver_id, name, details, created_at, updated_at
            FROM drivers
            ORDER BY name
        """
        
        rows = await self.conn.fetch(query)
        return [dict(row) for row in rows]
    
    # ============= ROUTE OPERATIONS =============
    
    async def create_route(self, route_data: Dict[str, Any]) -> int:
        """Create a new route"""
        query = """
            INSERT INTO routes (date, route_name, details, day_of_week)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (date, route_name) DO UPDATE
            SET details = EXCLUDED.details,
                day_of_week = EXCLUDED.day_of_week
            RETURNING route_id
        """
        
        route_id = await self.conn.fetchval(
            query,
            route_data['date'],
            route_data['route_name'],
            json.dumps(route_data['details']),
            route_data.get('day_of_week')
        )
        
        return route_id
    
    async def get_routes_for_week(self, week_start: date) -> List[Dict]:
        """Get all routes for a specific week"""
        query = """
            SELECT route_id, date, route_name, details, day_of_week, created_at
            FROM routes
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
            ORDER BY date, route_name
        """
        
        rows = await self.conn.fetch(query, week_start)
        return [dict(row) for row in rows]
    
    async def delete_routes_for_week(self, week_start: date):
        """Delete all routes for a specific week"""
        query = """
            DELETE FROM routes
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
        """
        
        await self.conn.execute(query, week_start)
    
    # ============= AVAILABILITY OPERATIONS =============
    
    async def create_availability(self, availability_data: Dict[str, Any]) -> int:
        """Create or update driver availability"""
        query = """
            INSERT INTO driver_availability (driver_id, date, available, notes)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (driver_id, date)
            DO UPDATE SET
                available = EXCLUDED.available,
                notes = CASE 
                    WHEN driver_availability.notes IS NULL THEN EXCLUDED.notes
                    ELSE driver_availability.notes || '; ' || EXCLUDED.notes
                END,
                updated_at = NOW()
            RETURNING id
        """
        
        avail_id = await self.conn.fetchval(
            query,
            availability_data['driver_id'],
            availability_data['date'],
            availability_data['available'],
            availability_data.get('notes')
        )
        
        return avail_id
    
    async def get_availability_for_week(self, week_start: date) -> List[Dict]:
        """Get all availability records for a week"""
        query = """
            SELECT da.id, da.driver_id, da.date, da.available, da.notes,
                   d.name as driver_name
            FROM driver_availability da
            JOIN drivers d ON da.driver_id = d.driver_id
            WHERE da.date >= $1 AND da.date < $1 + INTERVAL '7 days'
            ORDER BY d.name, da.date
        """
        
        rows = await self.conn.fetch(query, week_start)
        return [dict(row) for row in rows]
    
    async def delete_availability_for_week(self, week_start: date):
        """Delete availability records for a week"""
        query = """
            DELETE FROM driver_availability
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
        """
        
        await self.conn.execute(query, week_start)
    
    # ============= FIXED ASSIGNMENT OPERATIONS =============
    
    async def create_fixed_assignment(self, assignment_data: Dict[str, Any]) -> int:
        """Create a fixed assignment"""
        query = """
            INSERT INTO fixed_assignments (driver_id, route_id, date, details)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (driver_id, date, route_id)
            DO UPDATE SET
                details = EXCLUDED.details,
                updated_at = NOW()
            RETURNING id
        """
        
        assignment_id = await self.conn.fetchval(
            query,
            assignment_data['driver_id'],
            assignment_data.get('route_id'),
            assignment_data['date'],
            json.dumps(assignment_data.get('details', {}))
        )
        
        return assignment_id
    
    async def get_fixed_assignments_for_week(self, week_start: date) -> List[Dict]:
        """Get all fixed assignments for a week"""
        query = """
            SELECT fa.id, fa.driver_id, fa.route_id, fa.date, fa.details,
                   d.name as driver_name,
                   r.route_name
            FROM fixed_assignments fa
            JOIN drivers d ON fa.driver_id = d.driver_id
            LEFT JOIN routes r ON fa.route_id = r.route_id
            WHERE fa.date >= $1 AND fa.date < $1 + INTERVAL '7 days'
            ORDER BY d.name, fa.date
        """
        
        rows = await self.conn.fetch(query, week_start)
        return [dict(row) for row in rows]
    
    async def delete_fixed_assignments_for_week(self, week_start: date):
        """Delete fixed assignments for a week"""
        query = """
            DELETE FROM fixed_assignments
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
        """
        
        await self.conn.execute(query, week_start)
    
    # ============= HELPER METHODS =============
    
    async def get_route_by_name_and_date(self, route_name: str, route_date: date) -> Optional[Dict]:
        """Get route by name and date"""
        query = """
            SELECT route_id, date, route_name, details, day_of_week
            FROM routes
            WHERE route_name = $1 AND date = $2
        """
        
        row = await self.conn.fetchrow(query, route_name, route_date)
        return dict(row) if row else None
    
    async def clear_week_data(self, week_start: date):
        """Clear all data for a specific week (for replace action)"""
        await self.delete_fixed_assignments_for_week(week_start)
        await self.delete_availability_for_week(week_start)
        await self.delete_routes_for_week(week_start)