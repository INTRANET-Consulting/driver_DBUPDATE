import asyncpg
from typing import List, Dict, Any, Optional, Tuple
from datetime import date, datetime
from schemas.models import (
    Driver, Route, DriverAvailability, FixedAssignment,
    SeasonConfig, SchoolVacationPeriod, UploadHistory
)
import json
import time

AVAILABILITY_CACHE: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
AVAILABILITY_CACHE_TTL = 5.0  # seconds


class DatabaseService:
    """Database operations for weekly planning system"""
    
    def __init__(self, connection: asyncpg.Connection):
        self.conn = connection
    
    # ============= SEQUENCE RESET =============
    
    async def reset_sequences(self):
        """Reset all auto-increment sequences to start from 1"""
        try:
            # Reset drivers sequence - restart numbering from 1
            await self.conn.execute("""
                ALTER SEQUENCE drivers_driver_id_seq RESTART WITH 1;
            """)
            
            # Reset routes sequence
            await self.conn.execute("""
                ALTER SEQUENCE routes_route_id_seq RESTART WITH 1;
            """)
            
            # Reset driver_availability sequence
            await self.conn.execute("""
                ALTER SEQUENCE driver_availability_id_seq RESTART WITH 1;
            """)
            
            # Reset fixed_assignments sequence
            await self.conn.execute("""
                ALTER SEQUENCE fixed_assignments_id_seq RESTART WITH 1;
            """)
            
            print("✅ All ID sequences reset to start from 1")
            
        except Exception as e:
            print(f"⚠️ Could not reset sequences: {str(e)}")
            # Try alternative method using setval
            try:
                await self.conn.execute("SELECT setval('drivers_driver_id_seq', 1, false);")
                await self.conn.execute("SELECT setval('routes_route_id_seq', 1, false);")
                await self.conn.execute("SELECT setval('driver_availability_id_seq', 1, false);")
                await self.conn.execute("SELECT setval('fixed_assignments_id_seq', 1, false);")
                print("✅ Sequences reset using setval method")
            except Exception as e2:
                print(f"❌ Both sequence reset methods failed: {str(e2)}")
                raise
    
    async def clear_all_week_data(self):
        """Clear ALL data from all tables and reset sequences"""
        print("🗑️  Clearing ALL data from database...")
        
        # Delete in correct order (respecting foreign keys)
        await self.conn.execute("DELETE FROM fixed_assignments")
        await self.conn.execute("DELETE FROM driver_availability")
        await self.conn.execute("DELETE FROM routes")
        await self.conn.execute("DELETE FROM drivers")
        
        print("✅ All data cleared")
        
        # Reset sequences to start from 1
        await self.reset_sequences()
    
    async def clear_week_data(self, week_start: date):
        """Clear all data for a specific week (for replace action)"""
        print(f"🗑️  Clearing data for week starting {week_start}...")
        await self.delete_fixed_assignments_for_week(week_start)
        await self.delete_availability_for_week(week_start)
        await self.delete_routes_for_week(week_start)
        print("✅ Week data cleared")
    
    # ============= DRIVER OPERATIONS =============
    
    async def upsert_driver(self, driver_data: Dict[str, Any]) -> int:
        """Insert or update driver, return driver_id"""
        # First, try to find existing driver
        existing = await self.get_driver_by_name(driver_data['name'])
        
        if existing:
            # Update existing driver
            query = """
                UPDATE drivers 
                SET details = $1
                WHERE name = $2
                RETURNING driver_id
            """
            driver_id = await self.conn.fetchval(
                query,
                json.dumps(driver_data['details']),
                driver_data['name']
            )
        else:
            # Insert new driver
            query = """
                INSERT INTO drivers (name, details)
                VALUES ($1, $2)
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
            SELECT driver_id, name, details, created_at
            FROM drivers
            WHERE name = $1
        """
        
        row = await self.conn.fetchrow(query, name)
        return dict(row) if row else None

    async def get_driver_by_id(self, driver_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a driver row by ID"""
        query = """
            SELECT driver_id, name, details, created_at, updated_at
            FROM drivers
            WHERE driver_id = $1
        """
        row = await self.conn.fetchrow(query, driver_id)
        if not row:
            return None
        row_dict = dict(row)
        details = row_dict.get('details') or {}
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except json.JSONDecodeError:
                details = {}
        row_dict['details'] = details
        return row_dict
    
    async def get_all_drivers(self) -> List[Dict]:
        """Get all drivers"""
        query = """
            SELECT driver_id, name, details, created_at
            FROM drivers
            ORDER BY name
        """
        
        rows = await self.conn.fetch(query)
        result = []
        for row in rows:
            row_dict = dict(row)
            # Add updated_at as created_at since column doesn't exist
            row_dict['updated_at'] = row_dict['created_at']
            
            # Parse details if it's a JSON string
            if isinstance(row_dict['details'], str):
                try:
                    row_dict['details'] = json.loads(row_dict['details'])
                except:
                    row_dict['details'] = {}
            elif row_dict['details'] is None:
                row_dict['details'] = {}
            
            result.append(row_dict)
        
        return result

    async def update_driver(self, driver_id: int, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Update driver properties"""
        existing = await self.get_driver_by_id(driver_id)
        if not existing:
            return None
        new_name = update_data.get('name', existing['name'])
        new_details = existing.get('details', {})
        if update_data.get('details'):
            new_details.update(update_data['details'])
        row = await self.conn.fetchrow(
            """
            UPDATE drivers
            SET name = $1,
                details = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE driver_id = $3
            RETURNING driver_id, name, details, created_at, updated_at
            """,
            new_name,
            json.dumps(new_details),
            driver_id
        )
        if not row:
            return None
        updated = dict(row)
        details = updated.get('details') or {}
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except json.JSONDecodeError:
                details = {}
        updated['details'] = details
        return updated
    
    # ============= ROUTE OPERATIONS =============
    
    async def create_route(self, route_data: Dict[str, Any]) -> int:
        """Create a new route or update if exists"""
        # First check if route exists
        existing = await self.get_route_by_name_and_date(
            route_data['route_name'],
            route_data['date']
        )
        
        if existing:
            # Update existing route
            query = """
                UPDATE routes
                SET details = $1,
                    day_of_week = $2
                WHERE route_id = $3
                RETURNING route_id
            """
            route_id = await self.conn.fetchval(
                query,
                json.dumps(route_data['details']),
                route_data.get('day_of_week'),
                existing['route_id']
            )
        else:
            # Insert new route
            query = """
                INSERT INTO routes (date, route_name, details, day_of_week)
                VALUES ($1, $2, $3, $4)
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
        from datetime import timedelta
        import json
        
        week_end = week_start + timedelta(days=7)
        
        query = """
            SELECT route_id, date, route_name, details, day_of_week, created_at
            FROM routes
            WHERE date >= $1 AND date < $2
            ORDER BY date, route_name
        """
        
        rows = await self.conn.fetch(query, week_start, week_end)
        result = []
        for row in rows:
            row_dict = dict(row)
            
            # Parse details if it's a string
            if isinstance(row_dict['details'], str):
                try:
                    row_dict['details'] = json.loads(row_dict['details'])
                except:
                    row_dict['details'] = {}
            elif row_dict['details'] is None:
                row_dict['details'] = {}
            
            result.append(row_dict)
        
        return result
    
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
        # Check if exists
        existing_query = """
            SELECT id FROM driver_availability
            WHERE driver_id = $1 AND date = $2
        """
        existing = await self.conn.fetchval(
            existing_query,
            availability_data['driver_id'],
            availability_data['date']
        )
        
        if existing:
            # Update existing
            query = """
                UPDATE driver_availability
                SET available = $1,
                    shift_preference = COALESCE($2, shift_preference),
                    notes = CASE 
                        WHEN $3 IS NULL THEN notes
                        WHEN notes IS NULL THEN $3
                        ELSE notes || '; ' || $3
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING id
            """
            avail_id = await self.conn.fetchval(
                query,
                availability_data['available'],
                availability_data.get('shift_preference'),
                availability_data.get('notes'),
                existing
            )
        else:
            # Insert new
            query = """
                INSERT INTO driver_availability (driver_id, date, available, shift_preference, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            """
            avail_id = await self.conn.fetchval(
                query,
                availability_data['driver_id'],
                availability_data['date'],
                availability_data['available'],
                availability_data.get('shift_preference'),
                availability_data.get('notes')
            )
        
        return avail_id
    
    async def get_availability_for_week(self, week_start: date) -> List[Dict]:
        """Get all availability records for a week - OPTIMIZED VERSION"""
        from datetime import timedelta

        week_end = week_start + timedelta(days=7)
        cache_key = str(week_start)
        cached_entry = AVAILABILITY_CACHE.get(cache_key)
        if cached_entry and (time.time() - cached_entry[0]) < AVAILABILITY_CACHE_TTL:
            print(f"♻️  [AVAILABILITY] Returning cached data for week {week_start}")
            return cached_entry[1]

        print(f"\n{'='*60}")
        print(f"🔍 [DB SERVICE] get_availability_for_week")
        print(f"   Week: {week_start} to {week_end}")
        print(f"{'='*60}")

        # Step 1: Check record count first
        try:
            start = time.time()
            count = await self.conn.fetchval(
                "SELECT COUNT(*) FROM driver_availability WHERE date >= $1 AND date < $2",
                week_start, week_end
            )
            count_time = time.time() - start
            print(f"📊 Step 1: COUNT query")
            print(f"   Found: {count} records")
            print(f"   Time: {count_time:.3f}s")

            if count == 0:
                print(f"⚠️  No availability records found for this week!")
                AVAILABILITY_CACHE[cache_key] = (time.time(), [])
                return []

            if count > 5000:
                print(f"⚠️  WARNING: {count} records is very high! Expected ~350 for 50 drivers.")
                print(f"   This will likely cause timeout!")
        except Exception as e:
            print(f"❌ COUNT query failed: {str(e)}")

        # Step 2: Try main query with JOIN
        query = """
            SELECT 
                da.id, 
                da.driver_id, 
                da.date, 
                da.available, 
                da.notes,
                da.created_at, 
                da.updated_at,
                d.name as driver_name
            FROM driver_availability da
            INNER JOIN drivers d ON da.driver_id = d.driver_id
            WHERE da.date >= $1 AND da.date < $2
            ORDER BY d.name, da.date
        """

        print(f"\n🔄 Step 2: Main JOIN query")
        print(f"   Query: {query[:100]}...")

        try:
            start = time.time()
            rows = await self.conn.fetch(query, week_start, week_end)
            elapsed = time.time() - start

            print(f"✅ JOIN query SUCCESS")
            print(f"   Returned: {len(rows)} rows")
            print(f"   Time: {elapsed:.3f}s")

            if elapsed > 5.0:
                print(f"⚠️  Query was slow ({elapsed:.1f}s)")

            print(f"{'='*60}\n")
            result = [dict(row) for row in rows]
            AVAILABILITY_CACHE[cache_key] = (time.time(), result)
            return result

        except Exception as e:
            elapsed = time.time() - start if 'start' in locals() else 0
            print(f"❌ JOIN query FAILED")
            print(f"   Error: {str(e)}")
            print(f"   Time: {elapsed:.3f}s")

            # Step 3: Fallback - query without JOIN
            print(f"\n🔄 Step 3: FALLBACK query (without JOIN)")

            try:
                start_fallback = time.time()

                # Query 3a: Get availability records
                simple_query = """
                    SELECT 
                        id, 
                        driver_id, 
                        date, 
                        available, 
                        notes,
                        created_at, 
                        updated_at
                    FROM driver_availability
                    WHERE date >= $1 AND date < $2
                    ORDER BY driver_id, date
                """

                rows = await self.conn.fetch(simple_query, week_start, week_end)
                print(f"✅ Availability records: {len(rows)} rows in {time.time() - start_fallback:.3f}s")

                # Query 3b: Get all driver names
                driver_start = time.time()
                driver_rows = await self.conn.fetch("SELECT driver_id, name FROM drivers")
                driver_map = {row['driver_id']: row['name'] for row in driver_rows}
                print(f"✅ Driver names: {len(driver_map)} drivers in {time.time() - driver_start:.3f}s")

                # Query 3c: Combine in Python
                result = []
                for row in rows:
                    row_dict = dict(row)
                    row_dict['driver_name'] = driver_map.get(row['driver_id'], 'Unknown')
                    result.append(row_dict)

                total_fallback_time = time.time() - start_fallback
                print(f"✅ FALLBACK SUCCESS")
                print(f"   Total time: {total_fallback_time:.3f}s")
                print(f"   Returned: {len(result)} records")
                print(f"{'='*60}\n")
                AVAILABILITY_CACHE[cache_key] = (time.time(), result)
                return result
            except Exception as fallback_error:
                print(f"⚠️ FALLBACK also FAILED: {str(fallback_error)}")
                print(f"{'='*60}\n")
                raise

        return []

    async def get_availability_by_id(self, availability_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a single availability record"""
        row = await self.conn.fetchrow(
            """
            SELECT id, driver_id, date, available, shift_preference, notes, created_at, updated_at
            FROM driver_availability
            WHERE id = $1
            """,
            availability_id
        )
        return dict(row) if row else None

    async def update_availability_record(self, availability_id: int, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Update availability row with direct field control"""
        existing = await self.get_availability_by_id(availability_id)
        if not existing:
            return None
        row = await self.conn.fetchrow(
            """
            UPDATE driver_availability
            SET driver_id = $1,
                date = $2,
                available = $3,
                shift_preference = $4,
                notes = $5,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING id, driver_id, date, available, shift_preference, notes, created_at, updated_at
            """,
            update_data.get('driver_id', existing['driver_id']),
            update_data.get('date', existing['date']),
            update_data.get('available', existing['available']),
            update_data.get('shift_preference', existing.get('shift_preference')),
            update_data.get('notes', existing.get('notes')),
            availability_id
        )
        return dict(row) if row else None

    
    async def delete_availability_for_week(self, week_start: date):
        """Delete availability records for a week"""
        query = """
            DELETE FROM driver_availability
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
        """
        
        await self.conn.execute(query, week_start)
    
    # ============= FIXED ASSIGNMENT OPERATIONS =============
    
    async def create_fixed_assignment(self, assignment_data: Dict[str, Any]) -> int:
        """Create a fixed assignment (NO details column - just driver_id, route_id, date)"""
        # Check if exists
        existing_query = """
            SELECT id FROM fixed_assignments
            WHERE driver_id = $1 AND date = $2 AND route_id = $3
        """
        existing = await self.conn.fetchval(
            existing_query,
            assignment_data['driver_id'],
            assignment_data['date'],
            assignment_data['route_id']
        )
        
        if existing:
            # Already exists, just return the id
            return existing
        else:
            # Insert new (only driver_id, route_id, date)
            query = """
                INSERT INTO fixed_assignments (driver_id, route_id, date)
                VALUES ($1, $2, $3)
                RETURNING id
            """
            assignment_id = await self.conn.fetchval(
                query,
                assignment_data['driver_id'],
                assignment_data['route_id'],
                assignment_data['date']
            )
        
        return assignment_id
    
    async def get_fixed_assignments_for_week(self, week_start: date) -> List[Dict]:
        """Get all fixed assignments for a week"""
        query = """
            SELECT fa.id, fa.driver_id, fa.route_id, fa.date,
                   fa.created_at, fa.updated_at,
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

    async def get_fixed_assignment_by_id(self, assignment_id: int) -> Optional[Dict[str, Any]]:
        """Get a single fixed assignment"""
        row = await self.conn.fetchrow(
            """
            SELECT fa.id, fa.driver_id, fa.route_id, fa.date,
                   fa.created_at, fa.updated_at,
                   d.name as driver_name,
                   r.route_name
            FROM fixed_assignments fa
            JOIN drivers d ON fa.driver_id = d.driver_id
            LEFT JOIN routes r ON fa.route_id = r.route_id
            WHERE fa.id = $1
            """,
            assignment_id
        )
        return dict(row) if row else None
    
    async def delete_fixed_assignments_for_week(self, week_start: date):
        """Delete fixed assignments for a week"""
        query = """
            DELETE FROM fixed_assignments
            WHERE date >= $1 AND date < $1 + INTERVAL '7 days'
        """
        
        await self.conn.execute(query, week_start)
    
    async def delete_fixed_assignment(self, assignment_id: int) -> bool:
        """Delete a single fixed assignment"""
        result = await self.conn.execute(
            "DELETE FROM fixed_assignments WHERE id = $1",
            assignment_id
        )
        return result and result.endswith("1")
    
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

    async def get_route_by_id(self, route_id: int) -> Optional[Dict[str, Any]]:
        """Fetch route by ID"""
        query = """
            SELECT route_id, date, route_name, details, day_of_week, created_at
            FROM routes
            WHERE route_id = $1
        """
        row = await self.conn.fetchrow(query, route_id)
        if not row:
            return None
        row_dict = dict(row)
        details = row_dict.get('details') or {}
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except json.JSONDecodeError:
                details = {}
        row_dict['details'] = details
        return row_dict

    async def update_route(self, route_id: int, update_data: Dict[str, Any]) -> Optional[Dict]:
        """Update route metadata"""
        existing = await self.get_route_by_id(route_id)
        if not existing:
            return None
        new_route_name = update_data.get('route_name', existing['route_name'])
        new_date = update_data.get('date', existing['date'])
        new_day = update_data.get('day_of_week', existing.get('day_of_week'))
        new_details = existing.get('details', {})
        if update_data.get('details'):
            new_details.update(update_data['details'])
        row = await self.conn.fetchrow(
            """
            UPDATE routes
            SET route_name = $1,
                date = $2,
                day_of_week = $3,
                details = $4
            WHERE route_id = $5
            RETURNING route_id, date, route_name, details, day_of_week, created_at
            """,
            new_route_name,
            new_date,
            new_day,
            json.dumps(new_details),
            route_id
        )
        if not row:
            return None
        updated = dict(row)
        details = updated.get('details') or {}
        if isinstance(details, str):
            try:
                details = json.loads(details)
            except json.JSONDecodeError:
                details = {}
        updated['details'] = details
        return updated

    async def delete_route(self, route_id: int) -> bool:
        """Delete a route by ID"""
        result = await self.conn.execute(
            "DELETE FROM routes WHERE route_id = $1",
            route_id
        )
        return result.endswith("1")

    async def delete_driver(self, driver_id: int) -> bool:
        """Delete a driver by ID"""
        result = await self.conn.execute(
            "DELETE FROM drivers WHERE driver_id = $1",
            driver_id
        )
        return result.endswith("1")
