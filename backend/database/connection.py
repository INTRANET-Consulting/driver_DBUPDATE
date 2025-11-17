import asyncpg
from typing import Optional
from config.settings import settings


class DatabaseManager:
    """Manages database connection pool"""
    
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
    
    async def connect(self):
        """Initialize database connection pool"""
        if self.pool is None:
            # Check if DATABASE_URL is set
            if not settings.DATABASE_URL or settings.DATABASE_URL == "":
                raise ValueError(
                "❌ DATABASE_URL not set in .env file!\n"
                "Please add: DATABASE_URL=postgresql://user:password@host:port/database"
            )
        
        print(f"🔌 Connecting to database...")
        print(f"   Host: {settings.DATABASE_URL.split('@')[1].split('/')[0] if '@' in settings.DATABASE_URL else 'unknown'}")
        
        try:
            self.pool = await asyncpg.create_pool(
                settings.DATABASE_URL,
                min_size=2,
                max_size=10,
                command_timeout=120,  # ⬅️ INCREASED from 60 to 120 seconds
                server_settings={
                    'jit': 'off'  # Disable JIT compilation for faster query planning
                },
                ssl='require',
                statement_cache_size=0  # Disable prepared statements for Supabase pooler
            )
            print("✅ Database connection pool created")
            print(f"   Command timeout: 120 seconds")
            
            # Test the connection
            async with self.pool.acquire() as conn:
                version = await conn.fetchval('SELECT version()')
                print(f"✅ PostgreSQL connected: {version[:50]}...")
                
        except Exception as e:
            error_msg = str(e)
            print(f"\n❌ Database connection failed!")
            print(f"   Error: {error_msg}\n")
            
            if "getaddrinfo failed" in error_msg:
                print("💡 Possible causes:")
                print("   1. DATABASE_URL format is incorrect")
                print("   2. No internet connection")
                print("   3. Supabase project is paused/deleted")
                print("   4. Firewall blocking connection\n")
                print("🔍 Check your .env file:")
                print("   DATABASE_URL should look like:")
                print("   postgresql://postgres.xxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres\n")
            
            raise
    
    async def disconnect(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            self.pool = None
            print("✅ Database connection pool closed")
    
    async def get_connection(self):
        """Get a connection from the pool"""
        if not self.pool:
            await self.connect()
        return await self.pool.acquire()
    
    async def release_connection(self, connection):
        """Release connection back to pool"""
        await self.pool.release(connection)


# Global database manager instance
db_manager = DatabaseManager()


async def get_db():
    """Dependency for getting database connection"""
    connection = await db_manager.get_connection()
    try:
        yield connection
    finally:
        await db_manager.release_connection(connection)