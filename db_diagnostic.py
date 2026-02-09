"""
Database Diagnostic Tool for Tilo.life
Checks database connection and player data
"""

import asyncio
import asyncpg
import sys

DATABASE_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"


async def check_database():
    """Check database connection and data"""
    print("🔍 Tilo.life Database Diagnostic Tool")
    print("=" * 50)
    
    try:
        # Connect to database
        print("\n📡 Connecting to database...")
        conn = await asyncpg.connect(DATABASE_URL)
        print("✅ Connected successfully!")
        
        # Check tables
        print("\n📊 Checking tables...")
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        print(f"✅ Found {len(tables)} tables:")
        for table in tables:
            print(f"   - {table['table_name']}")
        
        # Check users table
        print("\n👥 Checking users table...")
        user_count = await conn.fetchval("SELECT COUNT(*) FROM users")
        print(f"✅ Total users: {user_count}")
        
        # Check registered users (non-guests)
        registered_count = await conn.fetchval("""
            SELECT COUNT(*) FROM users 
            WHERE email NOT LIKE 'guest_%'
        """)
        print(f"✅ Registered users: {registered_count}")
        
        # Check guest users
        guest_count = await conn.fetchval("""
            SELECT COUNT(*) FROM users 
            WHERE email LIKE 'guest_%'
        """)
        print(f"✅ Guest users: {guest_count}")
        
        # Get top 10 players
        print("\n🏆 Top 10 Players by Score:")
        top_players = await conn.fetch("""
            SELECT nickname, email, score, coins, survival_time, is_vip
            FROM users
            WHERE email NOT LIKE 'guest_%'
            ORDER BY score DESC
            LIMIT 10
        """)
        
        if top_players:
            for i, player in enumerate(top_players, 1):
                vip = "👑" if player['is_vip'] else "  "
                print(f"   {i}. {vip} {player['nickname']:<15} | Score: {player['score']:<8} | Coins: {player['coins']:<6} | Time: {player['survival_time']}s")
        else:
            print("   No registered players found")
        
        # Check for data issues
        print("\n🔍 Checking for data issues...")
        
        # Check for NULL nicknames
        null_nicks = await conn.fetchval("""
            SELECT COUNT(*) FROM users WHERE nickname IS NULL
        """)
        if null_nicks > 0:
            print(f"⚠️  Found {null_nicks} users with NULL nicknames")
        else:
            print("✅ No NULL nicknames")
        
        # Check for duplicate emails
        duplicates = await conn.fetch("""
            SELECT email, COUNT(*) as count
            FROM users
            GROUP BY email
            HAVING COUNT(*) > 1
        """)
        if duplicates:
            print(f"⚠️  Found {len(duplicates)} duplicate emails:")
            for dup in duplicates[:5]:
                print(f"   - {dup['email']}: {dup['count']} times")
        else:
            print("✅ No duplicate emails")
        
        # Check global events
        print("\n🎉 Checking active global events...")
        events = await conn.fetch("""
            SELECT event_type, event_value, expires_at
            FROM global_events
            WHERE expires_at > NOW()
        """)
        if events:
            print(f"✅ Found {len(events)} active events:")
            for event in events:
                print(f"   - {event['event_type']}: {event['event_value']} (expires: {event['expires_at']})")
        else:
            print("ℹ️  No active events")
        
        # Check chat messages
        print("\n💬 Checking recent chat messages...")
        messages = await conn.fetch("""
            SELECT nickname, message, created_at
            FROM chat_messages
            ORDER BY created_at DESC
            LIMIT 5
        """)
        if messages:
            print(f"✅ Found {len(messages)} recent messages:")
            for msg in messages:
                print(f"   - {msg['nickname']}: {msg['message']}")
        else:
            print("ℹ️  No chat messages")
        
        await conn.close()
        print("\n" + "=" * 50)
        print("✅ Diagnostic complete!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


async def fix_common_issues():
    """Fix common database issues"""
    print("\n🔧 Fixing common issues...")
    
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        
        # Update NULL nicknames
        updated = await conn.execute("""
            UPDATE users 
            SET nickname = 'Player_' || id 
            WHERE nickname IS NULL OR nickname = ''
        """)
        print(f"✅ Fixed NULL/empty nicknames: {updated}")
        
        # Ensure all users have valid scores
        updated = await conn.execute("""
            UPDATE users 
            SET score = 0 
            WHERE score IS NULL
        """)
        print(f"✅ Fixed NULL scores: {updated}")
        
        # Ensure all users have valid coins
        updated = await conn.execute("""
            UPDATE users 
            SET coins = 0 
            WHERE coins IS NULL
        """)
        print(f"✅ Fixed NULL coins: {updated}")
        
        await conn.close()
        print("✅ Fixes applied!")
        
    except Exception as e:
        print(f"❌ Error fixing issues: {e}")


if __name__ == "__main__":
    print("Choose an option:")
    print("1. Run diagnostic")
    print("2. Fix common issues")
    print("3. Both")
    
    choice = input("\nEnter choice (1-3): ").strip()
    
    if choice == "1":
        asyncio.run(check_database())
    elif choice == "2":
        asyncio.run(fix_common_issues())
    elif choice == "3":
        asyncio.run(check_database())
        asyncio.run(fix_common_issues())
        asyncio.run(check_database())
    else:
        print("Invalid choice")
