import asyncio
import asyncpg
import os

DATABASE_URL = 'postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'

async def check():
    conn = await asyncpg.connect(DATABASE_URL)
    print("Checking game_results...")
    res = await conn.fetch("SELECT * FROM game_results ORDER BY played_at DESC LIMIT 5")
    for r in res:
        print(dict(r))
    
    print("\nChecking latest users...")
    users = await conn.fetch("SELECT nickname, email, last_active FROM users ORDER BY last_active DESC LIMIT 5")
    for u in users:
        print(dict(u))
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(check())
