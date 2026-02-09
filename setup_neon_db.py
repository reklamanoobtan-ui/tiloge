# v1.0.1 - GitHub Actions Sync Test
import asyncio
import asyncpg
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
if DATABASE_URL:
    print("📋 Using DATABASE_URL from environment secrets.")
else:
    print("⚠️ DATABASE_URL secret not found! Using fallback URL.")
    DATABASE_URL = 'postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'

async def setup_database():
    """
    Sets up the Tilo.ge database schema using Python.
    Creates users table and game_history table to track player achievements.
    """
    print("🚀 Starting Database Setup for Neon...")
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        print("✅ Connected to Neon database.")

        # 1. Create Users Table (Profiles & Accumulated Stats)
        # We ensure total_coins exists as requested
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                nickname VARCHAR(50) NOT NULL,
                score INTEGER DEFAULT 0,
                coins INTEGER DEFAULT 0,
                total_coins INTEGER DEFAULT 0,
                survival_time INTEGER DEFAULT 0,
                best_score INTEGER DEFAULT 0,
                best_survival_time INTEGER DEFAULT 0,
                total_survival_time INTEGER DEFAULT 0,
                is_vip BOOLEAN DEFAULT FALSE,
                last_active TIMESTAMP DEFAULT NOW(),
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)
        print("✅ Users table is ready.")

        # Ensure total_coins column exists if table was created previously without it
        try:
            await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins INTEGER DEFAULT 0;")
        except:
            pass

        # 2. Create Game History Table (Match Achievements)
        # Tracks every single game result: Score, Time, and Coins gained
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS game_results (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                duration_seconds INTEGER NOT NULL,
                coins_earned INTEGER NOT NULL,
                played_at TIMESTAMP DEFAULT NOW()
            );
        """)
        print("✅ Game Results (Achievements) table is ready.")

        # 3. Create Supporting Tables (Chat & Events)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                nickname VARCHAR(50),
                message TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS global_events (
                event_type VARCHAR(50) PRIMARY KEY,
                event_value TEXT,
                expires_at TIMESTAMP
            );
        """)
        print("✅ Supporting tables (Chat, Events) are ready.")

        await conn.close()
        print("\n✨ Database Setup Successful! Tilo.ge is now tracking detailed match achievements.")
        
    except Exception as e:
        print(f"❌ Error setting up database: {e}")

if __name__ == "__main__":
    asyncio.run(setup_database())
