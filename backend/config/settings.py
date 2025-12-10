from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Database
    DATABASE_URL: str
    SUPABASE_URL: Optional[str] = None
    SUPABASE_KEY: Optional[str] = None
    
    # Application
    DEBUG: bool = False
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 10485760  # 10MB
    
    # CORS
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Google Sheets Integration
    GOOGLE_CREDENTIALS_FILE: str = "service-account-credentials.json"
    GOOGLE_SHEET_NAME: str = "Bachertest"
    ENABLE_GOOGLE_SHEETS_SYNC: bool = True
    API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
