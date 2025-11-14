import openpyxl
from openpyxl.worksheet.worksheet import Worksheet
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Optional, Any
import re


class ExcelParser:
    """
    Parses weekly planning Excel file with 4 sheets:
    1. Dienste (Routes)
    2. Lenker (Drivers)
    3. Feiertag (Public Holidays)
    4. Dienstplan (Weekly Planning Grid)
    """
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.workbook = openpyxl.load_workbook(file_path, data_only=True)
        self.data = {
            'routes': [],
            'drivers': [],
            'public_holidays': [],
            'driver_availability': [],
            'fixed_assignments': [],
            'school_days': {}
        }
        
        # Print available sheets for debugging
        print(f"📊 Available sheets in Excel: {self.workbook.sheetnames}")
    
    def _find_sheet(self, *possible_names):
        """Find sheet by multiple possible names (case-insensitive)"""
        sheet_names_lower = {name.lower(): name for name in self.workbook.sheetnames}
        
        for name in possible_names:
            name_lower = name.lower()
            if name_lower in sheet_names_lower:
                return self.workbook[sheet_names_lower[name_lower]]
        
        return None
    
    def parse_all(self, week_start: date) -> Dict[str, Any]:
        """Parse all sheets and return structured data"""
        # Parse each sheet
        self.parse_dienste_sheet(week_start)
        self.parse_lenker_sheet()
        self.parse_feiertag_sheet()
        self.parse_dienstplan_sheet(week_start)
        
        return self.data
    
    # ============= SHEET 1: DIENSTE (ROUTES) =============
    
    def parse_dienste_sheet(self, week_start: date):
        """Parse routes sheet with seasonal availability"""
        sheet = self._find_sheet('Dienste', 'Routes', 'dienste')
        
        if not sheet:
            print("⚠️  Routes sheet not found (looking for 'Dienste')")
            print(f"   Available sheets: {self.workbook.sheetnames}")
            return
        
        # Parse Table 1: Route definitions
        route_definitions = self._parse_route_definitions(sheet)
        
        # Parse Table 2: Seasonal availability
        seasonal_routes = self._parse_seasonal_routes(sheet)
        
        # Determine season and school status for the week
        season, school_status = self._determine_season_and_school(week_start)
        
        # Get applicable routes for this week
        season_key = self._get_season_key(season, school_status)
        applicable_routes = seasonal_routes.get(season_key, [])
        
        # Generate route entries for the week
        self._generate_weekly_routes(
            week_start,
            applicable_routes,
            route_definitions,
            season,
            school_status
        )
    
    def _parse_route_definitions(self, sheet: Worksheet) -> Dict[str, Dict]:
        """Parse first table with route details"""
        route_defs = {}
        
        # Find the table (usually starts around row 3-5)
        start_row = 3
        for row_idx in range(start_row, min(start_row + 100, sheet.max_row)):
            row = sheet[row_idx]
            
            # Column structure: Linien/Dienst, Dienst-Nr, VAD[mS], VAD[oS], Diäten, Tag, KFZ-Ort
            dienst_nr = row[1].value  # Column B
            
            if not dienst_nr or dienst_nr in ['Dienst-Nr.', 'Dienst-Nr']:
                continue
            
            # Skip special entries (we'll handle them separately)
            if dienst_nr in ['FT', 'K', 'FREI', 'U', 'SOF', 'MB', 'DI']:
                continue
            
            route_defs[str(dienst_nr).strip()] = {
                'linien_dienst': row[0].value,
                'dienst_nr': dienst_nr,
                'vad_mit_schule': self._parse_time(row[2].value),
                'vad_ohne_schule': self._parse_time(row[3].value),
                'diaten': self._parse_number(row[4].value),
                'tag': row[5].value,  # Days of week
                'kfz_ort': row[6].value  # Location
            }
        
        return route_defs
    
    def _parse_seasonal_routes(self, sheet: Worksheet) -> Dict[str, List[str]]:
        """Parse second table with seasonal route availability"""
        seasonal = {
            'summer_mit_schule': [],
            'summer_ohne_schule': [],
            'winter_mit_schule': [],
            'winter_ohne_schule': []
        }
        
        # Find the seasonal table (usually to the right of first table)
        # Headers: SmS, SoS, WmS, WoS (around columns I-L)
        header_row = None
        start_col = 8  # Column I
        
        for row_idx in range(1, 10):
            row = sheet[row_idx]
            if row[start_col].value in ['SmS', 'SoS', 'WmS', 'WoS']:
                header_row = row_idx
                break
        
        if not header_row:
            print("⚠️ Could not find seasonal routes table")
            return seasonal
        
        # Parse each column
        col_mapping = {
            start_col: 'summer_mit_schule',      # SmS
            start_col + 1: 'summer_ohne_schule', # SoS
            start_col + 2: 'winter_mit_schule',  # WmS
            start_col + 3: 'winter_ohne_schule'  # WoS
        }
        
        for col_idx, season_key in col_mapping.items():
            for row_idx in range(header_row + 1, min(header_row + 100, sheet.max_row)):
                cell_value = sheet.cell(row_idx, col_idx + 1).value
                if cell_value and str(cell_value).strip():
                    seasonal[season_key].append(str(cell_value).strip())
        
        return seasonal
    
    def _generate_weekly_routes(self, week_start: date, applicable_routes: List[str],
                                route_definitions: Dict, season: str, school_status: str):
        """Generate route entries for each day of the week"""
        
        for route_name in applicable_routes:
            if route_name not in route_definitions:
                continue
            
            route_def = route_definitions[route_name]
            
            # Check if this is a Saturday-only route (ends with 'SA')
            is_saturday_route = route_name.upper().endswith('SA')
            
            if is_saturday_route:
                # Saturday routes only run on Saturday (day_offset=5)
                current_date = week_start + timedelta(days=5)
                day_name = 'Saturday'
                
                # Choose correct VAD time based on school status
                vad_time = (route_def['vad_mit_schule'] if school_status == 'mit_schule'
                           else route_def['vad_ohne_schule'])
                
                # Skip if no VAD time (route doesn't run)
                if not vad_time:
                    continue
                
                # Calculate duration
                duration = route_def['diaten'] if route_def['diaten'] else 0
                
                self.data['routes'].append({
                    'date': current_date,
                    'route_name': route_name,
                    'day_of_week': day_name,
                    'details': {
                        'type': 'saturday',
                        'duration_hours': duration,
                        'diaten': route_def['diaten'],
                        'vad_time': vad_time,
                        'location': route_def['kfz_ort'],
                        'season': season,
                        'school_status': school_status
                    }
                })
            else:
                # Regular routes - determine which days this route runs
                tag = route_def.get('tag', '')
                if not tag:
                    continue
                
                # Parse days (e.g., "Mo-Fr", "Sa.", "Mo,Mi,Fr")
                days_of_week = self._parse_days_of_week(tag)
                
                # IMPORTANT: Regular routes should NOT run on Saturday (5)
                # Even if tag says "Mo-Fr" or includes Saturday, only SA routes run on Saturday
                if 5 in days_of_week:
                    days_of_week.remove(5)
                
                # Create route entry for each applicable day
                for day_offset in days_of_week:
                    current_date = week_start + timedelta(days=day_offset)
                    day_name = current_date.strftime('%A')
                    
                    # Choose correct VAD time based on school status
                    vad_time = (route_def['vad_mit_schule'] if school_status == 'mit_schule'
                               else route_def['vad_ohne_schule'])
                    
                    # Skip if no VAD time (route doesn't run)
                    if not vad_time:
                        continue
                    
                    # Calculate duration (approximate from VAD time and Diäten)
                    duration = route_def['diaten'] if route_def['diaten'] else 0
                    
                    self.data['routes'].append({
                        'date': current_date,
                        'route_name': route_name,
                        'day_of_week': day_name,
                        'details': {
                            'type': 'regular',
                            'duration_hours': duration,
                            'diaten': route_def['diaten'],
                            'vad_time': vad_time,
                            'location': route_def['kfz_ort'],
                            'season': season,
                            'school_status': school_status
                        }
                    })
    
    # ============= SHEET 2: LENKER (DRIVERS) =============
    
    def parse_lenker_sheet(self):
        """Parse drivers sheet with availability and fixed assignments"""
        sheet = self._find_sheet('Lenker', 'Drivers', 'lenker')
        
        if not sheet:
            print("⚠️  Drivers sheet not found (looking for 'Lenker')")
            print(f"   Available sheets: {self.workbook.sheetnames}")
            return
        
        # Find header row
        header_row = None
        for row_idx in range(1, 10):
            row = sheet[row_idx]
            if row[0].value == 'Lenker' or row[0].value == 'Name':
                header_row = row_idx
                break
        
        if not header_row:
            print("⚠️ Could not find header row in Lenker sheet")
            return
        
        # Parse each driver row
        for row_idx in range(header_row + 1, sheet.max_row + 1):
            row = sheet[row_idx]
            
            driver_name = row[0].value
            if not driver_name or driver_name == '':
                break
            
            # Parse driver data
            soll_std = self._parse_hours(row[1].value)  # Target hours
            b_grad = self._parse_percentage(row[2].value)  # Employment %
            feiertag_hours = self._parse_hours(row[3].value)  # Vacation hours
            krankenstand_hours = self._parse_hours(row[4].value)  # Sick hours
            fixdienst_ms = row[5].value  # Fixed route with school
            fixdienst_os = row[6].value  # Fixed route without school
            
            # Add driver
            self.data['drivers'].append({
                'name': str(driver_name).strip(),
                'details': {
                    'monthly_hours_target': soll_std,
                    'employment_percentage': b_grad,
                    'vacation_hours': feiertag_hours,
                    'sick_leave_hours': krankenstand_hours,
                    'fixed_route_with_school': str(fixdienst_ms).strip() if fixdienst_ms else None,
                    'fixed_route_without_school': str(fixdienst_os).strip() if fixdienst_os else None
                }
            })
    
    # ============= SHEET 3: FEIERTAG (PUBLIC HOLIDAYS) =============
    
    def parse_feiertag_sheet(self):
        """Parse public holidays sheet (OPTIONAL)"""
        sheet = self._find_sheet('Feiertag', 'Holidays', 'feiertag', 'Feiertage', 'Freedays')
        
        if not sheet:
            print("ℹ️  Holidays sheet not found - skipping (this is optional)")
            # This is OK - holidays can be marked in other ways
            return
        
        # Find data (usually starts around row 2-3)
        for row_idx in range(1, sheet.max_row + 1):
            row = sheet[row_idx]
            
            # Assuming columns: Date, Holiday Name
            holiday_date = row[0].value
            holiday_name = row[1].value if len(row) > 1 else "Feiertag"
            
            if isinstance(holiday_date, datetime):
                holiday_date = holiday_date.date()
            elif isinstance(holiday_date, str):
                holiday_date = self._parse_date(holiday_date)
            
            if holiday_date and holiday_name:
                self.data['public_holidays'].append({
                    'date': holiday_date,
                    'name': str(holiday_name).strip()
                })
    
    # ============= SHEET 4: DIENSTPLAN (WEEKLY PLANNING) =============
    
    def parse_dienstplan_sheet(self, week_start: date):
        """Parse weekly planning sheet - extract remaining hours and school status"""
        sheet = self._find_sheet('Dienstplan', 'DP-Vorlage', 'Planning', 'dienstplan', 'Schedule')
        
        if not sheet:
            print("⚠️  Planning sheet not found (looking for 'Dienstplan' or 'DP-Vorlage')")
            print(f"   Available sheets: {self.workbook.sheetnames}")
            return
        
        # Find driver list section (left side)
        driver_header_row = None
        for row_idx in range(1, 20):
            row = sheet[row_idx]
            if row[0].value in ['Lenker', 'Name']:
                driver_header_row = row_idx
                break
        
        if not driver_header_row:
            return
        
        # Parse driver hours
        for row_idx in range(driver_header_row + 1, sheet.max_row + 1):
            row = sheet[row_idx]
            
            driver_name = row[0].value
            if not driver_name or driver_name == '':
                break
            
            soll_std = self._parse_hours(row[1].value)  # Monthly target
            ist_std = self._parse_hours(row[2].value)   # Already worked
            
            # Calculate remaining
            remaining = soll_std - ist_std if (soll_std and ist_std) else None
            
            # Update driver data with remaining hours
            for driver in self.data['drivers']:
                if driver['name'] == str(driver_name).strip():
                    driver['details']['hours_worked_this_month'] = ist_std
                    driver['details']['remaining_hours_this_month'] = remaining
                    break
        
        # Parse calendar section (right side) to extract school status
        # Find the date row
        date_row_idx = None
        for row_idx in range(1, 20):
            row = sheet[row_idx]
            # Look for dates in cells
            for col_idx in range(3, min(20, sheet.max_column + 1)):
                cell_value = sheet.cell(row_idx, col_idx).value
                if isinstance(cell_value, datetime):
                    date_row_idx = row_idx
                    break
            if date_row_idx:
                break
        
        if date_row_idx:
            # Row above dates usually has "Schule" or "Schulfrei" indicators
            school_status_row_idx = date_row_idx - 1
            
            # Parse school status for each date column
            for col_idx in range(3, min(20, sheet.max_column + 1)):
                date_cell = sheet.cell(date_row_idx, col_idx).value
                school_cell = sheet.cell(school_status_row_idx, col_idx).value
                
                if isinstance(date_cell, datetime):
                    current_date = date_cell.date()
                    
                    # Check school status
                    is_school_day = True
                    if school_cell and isinstance(school_cell, str):
                        school_text = str(school_cell).lower()
                        if 'frei' in school_text or 'ohne' in school_text:
                            is_school_day = False
                    
                    self.data['school_days'][current_date] = is_school_day
    
    # ============= HELPER METHODS =============
    
    def _determine_season_and_school(self, week_start: date) -> Tuple[str, str]:
        """Determine season and school status for given week"""
        month = week_start.month
        
        # Season logic
        if 6 <= month <= 9:
            season = "summer"
        else:
            season = "winter"
        
        # School status - check parsed school_days data
        # Default to mit_schule unless we find otherwise
        school_status = "mit_schule"
        
        # Check if any day in the week is marked as school-free
        for day_offset in range(7):
            current_date = week_start + timedelta(days=day_offset)
            if current_date in self.data['school_days']:
                if not self.data['school_days'][current_date]:
                    school_status = "ohne_schule"
                    break
        
        return season, school_status
    
    def _get_season_key(self, season: str, school_status: str) -> str:
        """Convert season and school status to seasonal route key"""
        return f"{season}_{school_status}"
    
    def _parse_days_of_week(self, tag: str) -> List[int]:
        """Parse day string (e.g., 'Mo-Fr', 'Sa.') to list of day indices (0=Mon, 6=Sun)"""
        if not tag:
            return []
        
        tag = tag.strip()
        days = []
        
        # Handle ranges like "Mo-Fr"
        if '-' in tag:
            parts = tag.split('-')
            if len(parts) == 2:
                start_day = self._day_name_to_index(parts[0])
                end_day = self._day_name_to_index(parts[1])
                if start_day is not None and end_day is not None:
                    return list(range(start_day, end_day + 1))
        
        # Handle single day like "Sa."
        day_idx = self._day_name_to_index(tag)
        if day_idx is not None:
            return [day_idx]
        
        return days
    
    def _day_name_to_index(self, day_abbrev: str) -> Optional[int]:
        """Convert German day abbreviation to index (0=Mon, 6=Sun)"""
        mapping = {
            'Mo': 0, 'Mo.': 0,
            'Di': 1, 'Di.': 1,
            'Mi': 2, 'Mi.': 2,
            'Do': 3, 'Do.': 3,
            'Fr': 4, 'Fr.': 4,
            'Sa': 5, 'Sa.': 5,
            'So': 6, 'So.': 6
        }
        return mapping.get(day_abbrev.strip(), None)
    
    def _parse_time(self, value) -> Optional[str]:
        """Parse time value from cell"""
        if value is None:
            return None
        
        if isinstance(value, datetime):
            return value.strftime('%H:%M')
        
        if isinstance(value, str):
            # Handle "00:00" as None (route doesn't run)
            if value == "00:00":
                return None
            return value.strip()
        
        return str(value)
    
    def _parse_number(self, value) -> Optional[float]:
        """Parse numeric value from cell"""
        if value is None:
            return None
        
        if isinstance(value, (int, float)):
            return float(value)
        
        if isinstance(value, str):
            try:
                return float(value.replace(',', '.'))
            except ValueError:
                return None
        
        return None
    
    def _parse_hours(self, value) -> Optional[float]:
        """Parse hours from HH:MM format or decimal"""
        if value is None:
            return None
        
        if isinstance(value, (int, float)):
            return float(value)
        
        if isinstance(value, str):
            # Handle HH:MM format
            if ':' in value:
                parts = value.split(':')
                if len(parts) == 2:
                    try:
                        hours = int(parts[0])
                        minutes = int(parts[1])
                        return hours + (minutes / 60)
                    except ValueError:
                        return None
            
            # Handle decimal
            try:
                return float(value.replace(',', '.'))
            except ValueError:
                return None
        
        return None
    
    def _parse_percentage(self, value) -> Optional[int]:
        """Parse percentage value"""
        if value is None:
            return None
        
        if isinstance(value, (int, float)):
            return int(value)
        
        if isinstance(value, str):
            # Remove % sign
            value = value.replace('%', '').strip()
            try:
                return int(float(value))
            except ValueError:
                return None
        
        return None
    
    def _parse_date(self, value) -> Optional[date]:
        """Parse date from various formats"""
        if isinstance(value, datetime):
            return value.date()
        
        if isinstance(value, date):
            return value
        
        if isinstance(value, str):
            # Try common formats
            formats = [
                '%d-%m-%Y',
                '%d.%m.%Y',
                '%Y-%m-%d',
                '%d/%m/%Y'
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(value.strip(), fmt).date()
                except ValueError:
                    continue
        
        return None