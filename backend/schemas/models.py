from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import date, datetime


# ============= UPLOAD MODELS =============

class UnavailableDriver(BaseModel):
    """Model for manually specified unavailable drivers"""
    driver_name: str
    dates: List[date]
    reason: Optional[str] = None


class UploadRequest(BaseModel):
    """Request model for weekly plan upload"""
    week_start: date
    action: str = Field(default="replace", pattern="^(replace|append)$")
    unavailable_drivers: Optional[List[UnavailableDriver]] = []


class UploadResponse(BaseModel):
    """Response model for upload operation"""
    success: bool
    week_start: date
    season: str
    school_status: str  # "mit_schule" or "ohne_schule"
    records_created: Dict[str, int]
    action_taken: str
    message: Optional[str] = None
    errors: Optional[List[str]] = []


# ============= DRIVER MODELS =============

class DriverDetails(BaseModel):
    """Driver details stored in JSONB"""
    monthly_hours_target: Optional[float] = None
    employment_percentage: Optional[int] = None
    vacation_hours: Optional[float] = None  # Feiertag - for display only
    sick_leave_hours: Optional[float] = None  # Krankenstand - for display only
    hours_worked_this_month: Optional[float] = None
    remaining_hours_this_month: Optional[float] = None
    fixed_route_with_school: Optional[str] = None
    fixed_route_without_school: Optional[str] = None


class Driver(BaseModel):
    """Driver model"""
    driver_id: Optional[int] = None
    name: str
    details: DriverDetails = Field(default_factory=DriverDetails)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============= ROUTE MODELS =============

class RouteDetails(BaseModel):
    """Route details stored in JSONB"""
    type: str = "regular"  # regular, special_duty
    duration_hours: Optional[float] = None
    diaten: Optional[float] = None
    vad_time: Optional[str] = None
    location: Optional[str] = None
    season: Optional[str] = None
    school_status: Optional[str] = None
    duty_code: Optional[str] = None  # For MB, DI, SOF
    duty_name: Optional[str] = None


class Route(BaseModel):
    """Route model"""
    route_id: Optional[int] = None
    date: date
    route_name: str
    details: RouteDetails = Field(default_factory=RouteDetails)
    day_of_week: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============= AVAILABILITY MODELS =============

class DriverAvailability(BaseModel):
    """Driver availability model"""
    id: Optional[int] = None
    driver_id: int
    date: date
    available: bool = True
    shift_preference: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============= FIXED ASSIGNMENT MODELS =============

class FixedAssignmentDetails(BaseModel):
    """Fixed assignment details"""
    type: str = "regular"  # regular, special_duty
    duty_code: Optional[str] = None
    duty_name: Optional[str] = None
    blocks_regular_assignment: bool = False
    additional_routes: Optional[List[int]] = []


class FixedAssignment(BaseModel):
    """Fixed assignment model"""
    id: Optional[int] = None
    driver_id: int
    route_id: Optional[int] = None
    date: date
    details: FixedAssignmentDetails = Field(default_factory=FixedAssignmentDetails)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============= SEASON CONFIG MODELS =============

class SeasonConfig(BaseModel):
    """Season configuration model"""
    id: Optional[int] = None
    season_name: str
    start_month: int = Field(ge=1, le=12)
    start_day: int = Field(ge=1, le=31)
    end_month: int = Field(ge=1, le=12)
    end_day: int = Field(ge=1, le=31)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SchoolVacationPeriod(BaseModel):
    """School vacation period model"""
    id: Optional[int] = None
    name: str
    start_date: date
    end_date: date
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============= WEEKLY DATA RESPONSE MODELS =============

class WeeklyRoutesResponse(BaseModel):
    """Response model for weekly routes view"""
    week_start: date
    season: str
    school_status: str
    routes: List[Route]


class WeeklyDriversResponse(BaseModel):
    """Response model for weekly drivers view"""
    week_start: date
    drivers: List[Driver]


class WeeklyAvailabilityResponse(BaseModel):
    """Response model for weekly availability view"""
    week_start: date
    availability: List[DriverAvailability]


# ============= UPLOAD HISTORY MODEL =============

class UploadHistory(BaseModel):
    """Upload history model"""
    id: Optional[int] = None
    filename: str
    week_start: date
    uploaded_at: Optional[datetime] = None
    uploaded_by: Optional[str] = None
    action: str
    records_affected: Dict[str, int] = Field(default_factory=dict)
    status: str = "processing"
    error_message: Optional[str] = None

    class Config:
        from_attributes = True