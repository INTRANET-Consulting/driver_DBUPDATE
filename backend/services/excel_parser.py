import openpyxl
from openpyxl.worksheet.worksheet import Worksheet
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Optional, Any
import re


class ExcelParser:
    """
    Parses weekly planning Excel file with 4 sheets:
    1. Dienste (Routes)
    2. Lenker (Drivers) - formerly "Feldkirchen 202507"
    3. Feiertag (Public Holidays)
    4. Dienstplan (Weekly Planning Grid) - formerly "DP-Vorlage"
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
        # Parse Lenker sheet first to get driver base info
        self.parse_lenker_sheet()
        
        # Parse Dienstplan sheet to get worked hours and update driver info
        self.parse_dienstplan_sheet(week_start)
        
        # Parse other sheets
        self.parse_dienste_sheet(week_start)
        self.parse_feiertag_sheet()
        
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
            if dienst_nr in ['FT', 'K', 'FREI', 'F', 'U', 'SOF', 'MB', 'DI']:
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
        """Parse drivers sheet - base information"""
        sheet = self._find_sheet('Lenker', 'Drivers', 'lenker', 'Feldkirchen')
        
        if not sheet:
            print("⚠️  Drivers sheet not found (looking for 'Lenker' or 'Feldkirchen')")
            print(f"   Available sheets: {self.workbook.sheetnames}")
            return
        
        # Check if first row is header or data
        first_cell = sheet.cell(1, 1).value
        print(f"🔍 First cell value: '{first_cell}'")
        
        if first_cell in ['Lenker', 'Name']:
            # Has header row
            start_row = 2
            print(f"✅ Found Lenker header at row 1, data starts at row 2")
        else:
            # No header, data starts at row 1
            start_row = 1
            print(f"✅ Lenker sheet has no header, data starts at row 1")
        
        # Debug: Print header row values
        print(f"🔍 Header row contents:")
        for col in range(1, 9):
            print(f"   Col {col}: '{sheet.cell(1, col).value}'")
        
        # Debug: Print first data row
        print(f"🔍 First data row (row {start_row}) contents:")
        for col in range(1, 9):
            val = sheet.cell(start_row, col).value
            print(f"   Col {col}: '{val}' (type: {type(val).__name__})")
        
        # Parse each driver row
        for row_idx in range(start_row, sheet.max_row + 1):
            driver_name = sheet.cell(row_idx, 1).value
            
            if not driver_name or driver_name == '':
                break
            
            # Skip summary rows
            driver_name_str = str(driver_name).strip()
            if any(keyword in driver_name_str for keyword in ['Summe', 'Vollzeit', 'Feiertagsvergütung', 'Krankenstand']):
                print(f"  ⏭️  Skipping summary row: {driver_name_str}")
                break
            
            # Parse driver data - DIRECTLY read cell values
            col2 = sheet.cell(row_idx, 2).value  # Soll-Std.
            col3 = sheet.cell(row_idx, 3).value  # B-Grad [%]
            col4 = sheet.cell(row_idx, 4).value  # Feiertag
            col5 = sheet.cell(row_idx, 5).value  # Urlaub (not used)
            col6 = sheet.cell(row_idx, 6).value  # Krankenstand
            col7 = sheet.cell(row_idx, 7).value  # Fixdienst m.S.
            col8 = sheet.cell(row_idx, 8).value  # Fixdienst o.S.
            
            # Debug raw values for first 3 drivers
            if row_idx <= start_row + 2:
                print(f"  🔍 Row {row_idx} RAW: col2={col2}, col3={col3}, col4={col4}, col6={col6}")
            
            # Now parse them
            soll_std = self._parse_time_to_hours(col2)
            b_grad = self._parse_percentage(col3)
            feiertag_hours = self._parse_time_to_hours(col4)
            krankenstand_hours = self._parse_time_to_hours(col6)
            fixdienst_ms = col7
            fixdienst_os = col8
            
            # Determine employment type based on B-Grad
            employment_type = self._determine_employment_type(b_grad)
            
            # Debug print
            print(f"  📋 {driver_name_str}: Soll={soll_std}, B-Grad={b_grad}%, Type={employment_type}")
            
            # Add driver with base info
            self.data['drivers'].append({
                'name': driver_name_str,
                'details': {
                    'type': employment_type,
                    'monthly_hours_target': soll_std,
                    'monthly_hours_worked': None,  # Will be filled from Dienstplan
                    'monthly_hours_remaining': None,  # Will be calculated
                    'feiertag_hours': feiertag_hours,
                    'krankenstand_hours': krankenstand_hours,
                    'employment_percentage': b_grad,
                    'fixed_route_with_school': str(fixdienst_ms).strip() if fixdienst_ms and fixdienst_ms != 'None' else None,
                    'fixed_route_without_school': str(fixdienst_os).strip() if fixdienst_os and fixdienst_os != 'None' else None
                }
            })
        
        print(f"✅ Parsed {len(self.data['drivers'])} drivers from Lenker sheet")
    
    # ============= SHEET 3: FEIERTAG (PUBLIC HOLIDAYS) =============
    
    def parse_feiertag_sheet(self):
        """Parse public holidays sheet"""
        sheet = self._find_sheet('Feiertag', 'Holidays', 'feiertag', 'Feiertage', 'Freedays')
        
        if not sheet:
            print("ℹ️  Holidays sheet not found - skipping (this is optional)")
            return
        
        # Find data (usually starts around row 2-3)
        for row_idx in range(2, sheet.max_row + 1):
            row = sheet[row_idx]
            
            # Assuming columns: Feiertag, Datum
            holiday_name = row[0].value
            holiday_date = row[1].value
            
            if isinstance(holiday_date, datetime):
                holiday_date = holiday_date.date()
            elif isinstance(holiday_date, str):
                holiday_date = self._parse_date(holiday_date)
            
            if holiday_date and holiday_name:
                self.data['public_holidays'].append({
                    'date': holiday_date,
                    'name': str(holiday_name).strip()
                })
        
        print(f"✅ Parsed {len(self.data['public_holidays'])} public holidays")
    
    # ============= SHEET 4: DIENSTPLAN (WEEKLY PLANNING) =============
    
    def parse_dienstplan_sheet(self, week_start: date):
        """Parse weekly planning sheet - extract worked hours and update driver info"""
        sheet = self._find_sheet('Dienstplan', 'DP-Vorlage', 'Planning', 'dienstplan', 'Schedule')
        
        if not sheet:
            print("⚠️  Planning sheet not found (looking for 'Dienstplan' or 'DP-Vorlage')")
            print(f"   Available sheets: {self.workbook.sheetnames}")
            return
        
        # Find driver list section - look for "Lenker" in column A
        driver_header_row = None
        for row_idx in range(1, 20):
            cell_value = sheet.cell(row_idx, 1).value
            if cell_value and 'Lenker' in str(cell_value):
                driver_header_row = row_idx
                break
        
        if not driver_header_row:
            print("⚠️ Could not find driver header in Dienstplan sheet")
            return
        
        print(f"✅ Found Dienstplan header at row {driver_header_row}, data starts at row {driver_header_row + 1}")
        
        # Debug: Show header row
        print(f"🔍 Header row {driver_header_row}:")
        for col in range(1, 8):
            print(f"   Col {col}: '{sheet.cell(driver_header_row, col).value}'")
        
        # Debug: Show first data row
        first_data_row = driver_header_row + 1
        print(f"🔍 First data row {first_data_row}:")
        for col in range(1, 8):
            val = sheet.cell(first_data_row, col).value
            print(f"   Col {col}: '{val}' (type: {type(val).__name__})")
        
        # Parse driver hours
        for row_idx in range(driver_header_row + 1, sheet.max_row + 1):
            driver_name = sheet.cell(row_idx, 1).value
            
            if not driver_name or driver_name == '':
                break
            
            driver_name_str = str(driver_name).strip()
            
            # Skip summary/legend rows
            if any(keyword in driver_name_str for keyword in ['Legende', 'mS', 'oS', 'LD', 'RD', 'FT', 'Madrutter :', 'Dienst']):
                print(f"  ⏭️  Reached end/legend section at row {row_idx}: '{driver_name_str}'")
                break
            
            # Read Ist-Std from column C (index 3)
            ist_std_raw = sheet.cell(row_idx, 3).value
            ist_std = self._parse_time_to_hours(ist_std_raw)
            
            # Debug for first 3 drivers
            if row_idx <= driver_header_row + 3:
                print(f"  🔍 Row {row_idx}: Name='{driver_name_str}', Ist-Std RAW (col 3)='{ist_std_raw}' -> Parsed='{ist_std}'")
            
            # Find matching driver in self.data['drivers'] and update
            matched = False
            for driver in self.data['drivers']:
                if driver['name'] == driver_name_str:
                    target = driver['details']['monthly_hours_target']
                    
                    # Calculate remaining hours
                    remaining = self._subtract_time(target, ist_std) if target and ist_std else None
                    
                    driver['details']['monthly_hours_worked'] = ist_std
                    driver['details']['monthly_hours_remaining'] = remaining
                    
                    print(f"  ✅ {driver_name_str}: Target={target}, Worked={ist_std}, Remaining={remaining}")
                    matched = True
                    break
            
            if not matched:
                print(f"  ⚠️ No match found in Lenker data for: '{driver_name_str}'")
        
        # Parse calendar section - Find "Datum" row for school status
        datum_row = None
        for row_idx in range(1, 10):
            for col_idx in range(1, 20):
                cell_value = sheet.cell(row_idx, col_idx).value
                if cell_value and 'Datum' in str(cell_value):
                    datum_row = row_idx
                    break
            if datum_row:
                break
        
        if datum_row:
            # School status (mS/oS) is 2 rows above Datum
            school_status_row = datum_row - 2
            # Dates are in the Datum row
            date_row = datum_row
            
            print(f"✅ Found calendar section: School status at row {school_status_row}, Dates at row {date_row}")
            
            # Find which column the dates start (look for "Datum" text)
            date_start_col = None
            for col_idx in range(1, 20):
                if sheet.cell(datum_row, col_idx).value == 'Datum':
                    date_start_col = col_idx + 1  # Dates start in next column
                    break
            
            if date_start_col:
                # Parse school status for each date column
                for col_idx in range(date_start_col, min(date_start_col + 50, sheet.max_column + 1)):
                    date_cell = sheet.cell(date_row, col_idx).value
                    school_cell = sheet.cell(school_status_row, col_idx).value
                    
                    # Parse date
                    current_date = None
                    if isinstance(date_cell, datetime):
                        current_date = date_cell.date()
                    elif isinstance(date_cell, date):
                        current_date = date_cell
                    elif isinstance(date_cell, str):
                        current_date = self._parse_date(date_cell)
                    
                    if not current_date:
                        # No more dates, stop
                        break
                    
                    # Check school status
                    is_school_day = True
                    if school_cell and isinstance(school_cell, str):
                        school_text = str(school_cell).lower()
                        if 'frei' in school_text or 'ohne' in school_text or 'schulfrei' in school_text:
                            is_school_day = False
                    
                    self.data['school_days'][current_date] = is_school_day
        
        print(f"✅ Parsed school days for {len(self.data['school_days'])} dates")
    
    # ============= HELPER METHODS =============
    
    def _determine_employment_type(self, percentage: Optional[int]) -> str:
        """Determine employment type based on percentage"""
        if not percentage:
            return "unknown"
        
        if percentage >= 100:
            return "full_time"
        elif percentage >= 80:
            return "reduced_hours"
        else:
            return "part_time"
    
    def _parse_time_to_hours(self, value) -> Optional[str]:
        """Parse time value and return as HH:MM string"""
        if value is None:
            return None
        
        if isinstance(value, datetime):
            return value.strftime('%H:%M')
        
        if isinstance(value, str):
            value = value.strip()
            # Handle "00:00" or empty
            if value == "00:00" or value == "":
                return "00:00"
            # Check if already in HH:MM format
            if ':' in value:
                return value
            return value
        
        if isinstance(value, (int, float)):
            # Convert decimal hours to HH:MM
            hours = int(value)
            minutes = int((value - hours) * 60)
            return f"{hours:02d}:{minutes:02d}"
        
        return None
    
    def _subtract_time(self, time1: str, time2: str) -> str:
        """Subtract time2 from time1 (both in HH:MM format)"""
        try:
            # Parse time1
            h1, m1 = map(int, time1.split(':'))
            total_minutes1 = h1 * 60 + m1
            
            # Parse time2
            h2, m2 = map(int, time2.split(':'))
            total_minutes2 = h2 * 60 + m2
            
            # Subtract
            result_minutes = total_minutes1 - total_minutes2
            
            # Handle negative results
            if result_minutes < 0:
                result_minutes = 0
            
            # Convert back to HH:MM
            hours = result_minutes // 60
            minutes = result_minutes % 60
            
            return f"{hours:02d}:{minutes:02d}"
        except:
            return "00:00"
    
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
        