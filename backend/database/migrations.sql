-- Driver Scheduling Upload System - Database Schema
-- Run this on your NEW Supabase instance

-- 1. Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
    driver_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 2. Routes Table
CREATE TABLE IF NOT EXISTS public.routes (
    route_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    route_name TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    day_of_week TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_route_per_date UNIQUE (date, route_name)
);

-- 3. Driver Availability Table
CREATE TABLE IF NOT EXISTS public.driver_availability (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    shift_preference TEXT,
    notes TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_driver_date UNIQUE (driver_id, date)
);

-- 4. Fixed Assignments Table
CREATE TABLE IF NOT EXISTS public.fixed_assignments (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES public.drivers(driver_id) ON DELETE CASCADE,
    route_id INTEGER REFERENCES public.routes(route_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_fixed_assignment UNIQUE (driver_id, date, route_id)
);

-- 5. Assignments Table (for OR-Tools results)
CREATE TABLE IF NOT EXISTS public.assignments (
    id SERIAL PRIMARY KEY,
    week_start DATE NOT NULL,
    assignments JSONB NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 6. Season Configuration Table (NEW)
CREATE TABLE IF NOT EXISTS public.season_config (
    id SERIAL PRIMARY KEY,
    season_name TEXT NOT NULL UNIQUE,
    start_month INTEGER NOT NULL CHECK (start_month BETWEEN 1 AND 12),
    start_day INTEGER NOT NULL CHECK (start_day BETWEEN 1 AND 31),
    end_month INTEGER NOT NULL CHECK (end_month BETWEEN 1 AND 12),
    end_day INTEGER NOT NULL CHECK (end_day BETWEEN 1 AND 31),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 7. School Vacation Periods Table (NEW)
CREATE TABLE IF NOT EXISTS public.school_vacation_periods (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- 8. Upload History Table (NEW)
CREATE TABLE IF NOT EXISTS public.upload_history (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    week_start DATE NOT NULL,
    uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    uploaded_by TEXT,
    action TEXT CHECK (action IN ('replace', 'append')),
    records_affected JSONB DEFAULT '{}'::jsonb,
    status TEXT CHECK (status IN ('success', 'failed', 'processing')) DEFAULT 'processing',
    error_message TEXT
);

-- Insert default season configuration (Austrian school calendar)
INSERT INTO public.season_config (season_name, start_month, start_day, end_month, end_day)
VALUES 
    ('summer', 6, 1, 9, 30),
    ('winter', 10, 1, 5, 31)
ON CONFLICT (season_name) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_routes_date ON public.routes(date);
CREATE INDEX IF NOT EXISTS idx_driver_availability_date ON public.driver_availability(date);
CREATE INDEX IF NOT EXISTS idx_driver_availability_driver ON public.driver_availability(driver_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assignments_date ON public.fixed_assignments(date);
CREATE INDEX IF NOT EXISTS idx_fixed_assignments_driver ON public.fixed_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_upload_history_week ON public.upload_history(week_start);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_drivers_updated_at ON public.drivers;
CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_driver_availability_updated_at ON public.driver_availability;
CREATE TRIGGER update_driver_availability_updated_at
    BEFORE UPDATE ON public.driver_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fixed_assignments_updated_at ON public.fixed_assignments;
CREATE TRIGGER update_fixed_assignments_updated_at
    BEFORE UPDATE ON public.fixed_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_season_config_updated_at ON public.season_config;
CREATE TRIGGER update_season_config_updated_at
    BEFORE UPDATE ON public.season_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_school_vacation_updated_at ON public.school_vacation_periods;
CREATE TRIGGER update_school_vacation_updated_at
    BEFORE UPDATE ON public.school_vacation_periods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();