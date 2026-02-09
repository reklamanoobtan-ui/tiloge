"""
Neon Database Migration Tool
Automatically migrate data from old database to new database
"""

import asyncio
import asyncpg
import json
from datetime import datetime

# ============================================
# DATABASE CONNECTIONS
# ============================================

# OLD DATABASE (ძველი)
OLD_DB_URL = "postgresql://old_user:old_pass@old-host/old_db?sslmode=require"

# NEW DATABASE (ახალი)
NEW_DB_URL = "postgresql://new_user:new_pass@new-host/new_db?sslmode=require"


async def migrate_users(old_conn, new_conn):
    """Migrate users from old to new database"""
    print("\n👥 Migrating users...")
    
    try:
        # Export from old database
        users = await old_conn.fetch("""
            SELECT 
                email, password, nickname, score, coins, 
                is_vip, survival_time, best_score, 
                last_active, created_at
            FROM users
            ORDER BY id
        """)
        
        print(f"   Found {len(users)} users in old database")
        
        # Import to new database
        migrated = 0
        skipped = 0
        
        for user in users:
            try:
                await new_conn.execute("""
                    INSERT INTO users (
                        email, password, nickname, score, coins,
                        is_vip, survival_time, best_score,
                        last_active, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (email) DO UPDATE SET
                        score = GREATEST(users.score, EXCLUDED.score),
                        coins = users.coins + EXCLUDED.coins,
                        survival_time = GREATEST(users.survival_time, EXCLUDED.survival_time),
                        best_score = GREATEST(users.best_score, EXCLUDED.best_score),
                        last_active = EXCLUDED.last_active
                """, 
                    user['email'], user['password'], user['nickname'],
                    user['score'], user['coins'], user['is_vip'],
                    user['survival_time'], user['best_score'],
                    user['last_active'], user['created_at']
                )
                migrated += 1
            except Exception as e:
                print(f"   ⚠️  Skipped {user['email']}: {e}")
                skipped += 1
        
        print(f"   ✅ Migrated: {migrated} users")
        if skipped > 0:
            print(f"   ⚠️  Skipped: {skipped} users")
        
        return migrated
        
    except Exception as e:
        print(f"   ❌ Error migrating users: {e}")
        return 0


async def migrate_chat_messages(old_conn, new_conn, limit=100):
    """Migrate recent chat messages"""
    print(f"\n💬 Migrating last {limit} chat messages...")
    
    try:
        # Export from old database
        messages = await old_conn.fetch(f"""
            SELECT nickname, message, created_at
            FROM chat_messages
            ORDER BY created_at DESC
            LIMIT {limit}
        """)
        
        print(f"   Found {len(messages)} messages")
        
        # Import to new database
        migrated = 0
        for msg in messages:
            try:
                await new_conn.execute("""
                    INSERT INTO chat_messages (nickname, message, created_at)
                    VALUES ($1, $2, $3)
                """, msg['nickname'], msg['message'], msg['created_at'])
                migrated += 1
            except Exception as e:
                print(f"   ⚠️  Skipped message: {e}")
        
        print(f"   ✅ Migrated: {migrated} messages")
        return migrated
        
    except Exception as e:
        print(f"   ❌ Error migrating messages: {e}")
        return 0


async def migrate_global_events(old_conn, new_conn):
    """Migrate active global events"""
    print("\n🎉 Migrating active global events...")
    
    try:
        # Export active events from old database
        events = await old_conn.fetch("""
            SELECT event_type, event_value, expires_at, created_at
            FROM global_events
            WHERE expires_at > NOW()
        """)
        
        print(f"   Found {len(events)} active events")
        
        # Import to new database
        migrated = 0
        for event in events:
            try:
                await new_conn.execute("""
                    INSERT INTO global_events (event_type, event_value, expires_at, created_at)
                    VALUES ($1, $2, $3, $4)
                """, 
                    event['event_type'], event['event_value'],
                    event['expires_at'], event['created_at']
                )
                migrated += 1
            except Exception as e:
                print(f"   ⚠️  Skipped event: {e}")
        
        print(f"   ✅ Migrated: {migrated} events")
        return migrated
        
    except Exception as e:
        print(f"   ❌ Error migrating events: {e}")
        return 0


async def verify_migration(new_conn):
    """Verify migration results"""
    print("\n🔍 Verifying migration...")
    
    try:
        # Count users
        user_count = await new_conn.fetchval("SELECT COUNT(*) FROM users")
        print(f"   ✅ Total users: {user_count}")
        
        # Count registered users
        registered = await new_conn.fetchval("""
            SELECT COUNT(*) FROM users WHERE email NOT LIKE 'guest_%'
        """)
        print(f"   ✅ Registered users: {registered}")
        
        # Total score
        total_score = await new_conn.fetchval("SELECT SUM(score) FROM users")
        print(f"   ✅ Total score: {total_score}")
        
        # Total coins
        total_coins = await new_conn.fetchval("SELECT SUM(coins) FROM users")
        print(f"   ✅ Total coins: {total_coins}")
        
        # VIP users
        vip_count = await new_conn.fetchval("SELECT COUNT(*) FROM users WHERE is_vip = true")
        print(f"   ✅ VIP users: {vip_count}")
        
        # Top 5 players
        print("\n   🏆 Top 5 Players:")
        top_players = await new_conn.fetch("""
            SELECT nickname, score, coins, is_vip
            FROM users
            WHERE email NOT LIKE 'guest_%'
            ORDER BY score DESC
            LIMIT 5
        """)
        
        for i, player in enumerate(top_players, 1):
            vip = "👑" if player['is_vip'] else "  "
            print(f"      {i}. {vip} {player['nickname']:<15} Score: {player['score']:<8} Coins: {player['coins']}")
        
    except Exception as e:
        print(f"   ❌ Error verifying: {e}")


async def export_to_json(old_conn, filename="backup.json"):
    """Export all data to JSON file as backup"""
    print(f"\n💾 Creating JSON backup: {filename}")
    
    try:
        # Export users
        users = await old_conn.fetch("SELECT * FROM users ORDER BY id")
        users_data = [dict(user) for user in users]
        
        # Export messages
        messages = await old_conn.fetch("SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100")
        messages_data = [dict(msg) for msg in messages]
        
        # Export events
        events = await old_conn.fetch("SELECT * FROM global_events WHERE expires_at > NOW()")
        events_data = [dict(event) for event in events]
        
        # Create backup object
        backup = {
            "export_date": datetime.now().isoformat(),
            "users": users_data,
            "chat_messages": messages_data,
            "global_events": events_data,
            "stats": {
                "total_users": len(users_data),
                "total_messages": len(messages_data),
                "total_events": len(events_data)
            }
        }
        
        # Save to file
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(backup, f, indent=2, default=str, ensure_ascii=False)
        
        print(f"   ✅ Backup saved: {filename}")
        print(f"      - Users: {len(users_data)}")
        print(f"      - Messages: {len(messages_data)}")
        print(f"      - Events: {len(events_data)}")
        
    except Exception as e:
        print(f"   ❌ Error creating backup: {e}")


async def main():
    """Main migration process"""
    print("=" * 60)
    print("🔄 TILO.LIFE DATABASE MIGRATION TOOL")
    print("=" * 60)
    
    print("\n⚠️  IMPORTANT:")
    print("   1. Update OLD_DB_URL and NEW_DB_URL in this script")
    print("   2. Make sure new database has tables created")
    print("   3. This will NOT delete data from old database")
    print("   4. Duplicate emails will be merged (highest score kept)")
    
    proceed = input("\n   Continue? (yes/no): ").strip().lower()
    if proceed != 'yes':
        print("   Migration cancelled.")
        return
    
    try:
        # Connect to databases
        print("\n📡 Connecting to databases...")
        old_conn = await asyncpg.connect(OLD_DB_URL)
        print("   ✅ Connected to OLD database")
        
        new_conn = await asyncpg.connect(NEW_DB_URL)
        print("   ✅ Connected to NEW database")
        
        # Create JSON backup first
        await export_to_json(old_conn)
        
        # Migrate data
        users_migrated = await migrate_users(old_conn, new_conn)
        messages_migrated = await migrate_chat_messages(old_conn, new_conn)
        events_migrated = await migrate_global_events(old_conn, new_conn)
        
        # Verify
        await verify_migration(new_conn)
        
        # Close connections
        await old_conn.close()
        await new_conn.close()
        
        print("\n" + "=" * 60)
        print("✅ MIGRATION COMPLETE!")
        print("=" * 60)
        print(f"   Users migrated: {users_migrated}")
        print(f"   Messages migrated: {messages_migrated}")
        print(f"   Events migrated: {events_migrated}")
        print(f"   Backup saved: backup.json")
        print("\n   🎉 You can now use the new database!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
