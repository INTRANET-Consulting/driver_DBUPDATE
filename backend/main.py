from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database.connection import db_manager
from api.routes import upload, weekly_data
from config.settings import settings
from services.google_sheets_service import google_sheets_service  # ← NEW IMPORT


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    print("🚀 Starting Driver Scheduling Upload System...")
    await db_manager.connect()
    print("✅ Database connected")
    
    # Check Google Sheets service status
    if google_sheets_service.is_available():
        print("✅ Google Sheets service is available")
    else:
        print("⚠️  Google Sheets service is NOT available (check credentials)")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down...")
    await db_manager.disconnect()
    print("✅ Cleanup complete")


# Create FastAPI app
app = FastAPI(
    title="Driver Scheduling Upload System",
    description="Upload weekly planning Excel files and manage driver schedules",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload.router)
app.include_router(weekly_data.router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Driver Scheduling Upload System API",
        "version": "1.0.0",
        "docs": "/docs",
        "features": {
            "database": "PostgreSQL + Supabase",
            "google_sheets_sync": google_sheets_service.is_available()
        },
        "endpoints": {
            "upload": "/api/v1/upload/weekly-plan",
            "weekly_routes": "/api/v1/weekly/routes",
            "weekly_drivers": "/api/v1/weekly/drivers",
            "weekly_availability": "/api/v1/weekly/availability",
            "weekly_summary": "/api/v1/weekly/summary"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected" if db_manager.pool else "disconnected",
        "google_sheets": "available" if google_sheets_service.is_available() else "unavailable"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )