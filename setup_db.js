const { neon } = require('@neondatabase/serverless');

// Using the same database connection logic as your script.js
// In GitHub Actions, DATABASE_URL will be pulled from Secrets.
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function initDatabase() {
    console.log("🚀 Starting database schema sync...");
    try {
        // 1. Users Table
        await sql`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            nickname TEXT,
            score INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            total_coins INTEGER DEFAULT 0,
            survival_time INTEGER DEFAULT 0,
            best_score INTEGER DEFAULT 0,
            best_survival_time INTEGER DEFAULT 0,
            total_survival_time INTEGER DEFAULT 0,
            last_active TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // 2. Ensure all columns exist (Alters for existing DB)
        const alterQueries = [
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS best_score INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS best_survival_time INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_survival_time INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW()`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_skins TEXT DEFAULT '["default"]'`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_skin TEXT DEFAULT 'default'`,
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS duel_wins INTEGER DEFAULT 0`
        ];

        for (const query of alterQueries) {
            try {
                // We use tag-less call for plain strings
                await sql(query);
            } catch (e) {
                // Ignore errors if columns already exist
            }
        }

        // 3. Scores Table
        await sql`CREATE TABLE IF NOT EXISTS shared_scores (
            id SERIAL PRIMARY KEY,
            nickname TEXT NOT NULL,
            score INTEGER NOT NULL,
            survival_time INTEGER NOT NULL,
            efficiency FLOAT,
            shared_at TIMESTAMP DEFAULT NOW()
        )`;

        // 4. Chat Messages
        await sql`CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            nickname TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // 5. Reset Codes (Password Recovery)
        await sql`CREATE TABLE IF NOT EXISTS reset_codes (
            id SERIAL PRIMARY KEY,
            email TEXT,
            code TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // 6. Global Events (Admin Controls)
        await sql`CREATE TABLE IF NOT EXISTS global_events (
            event_type TEXT PRIMARY KEY,
            event_value TEXT,
            expires_at TIMESTAMP
        )`;

        // 7. Duel System
        await sql`CREATE TABLE IF NOT EXISTS duel_invitations (
            id SERIAL PRIMARY KEY, 
            sender_email VARCHAR(255) NOT NULL, 
            receiver_email VARCHAR(255) NOT NULL, 
            status VARCHAR(20) DEFAULT 'pending', 
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS duels (
            id SERIAL PRIMARY KEY, 
            player1_email VARCHAR(255) NOT NULL, 
            player2_email VARCHAR(255) NOT NULL, 
            player1_score INTEGER DEFAULT 0, 
            player2_score INTEGER DEFAULT 0, 
            player1_pos JSONB, 
            player2_pos JSONB, 
            p1_last_active TIMESTAMP DEFAULT NOW(), 
            p2_last_active TIMESTAMP DEFAULT NOW(), 
            start_time TIMESTAMP DEFAULT NOW(), 
            end_time TIMESTAMP, 
            winner_email VARCHAR(255), 
            status VARCHAR(20) DEFAULT 'active'
        )`;

        await sql`CREATE TABLE IF NOT EXISTS duel_stains (
            id SERIAL PRIMARY KEY,
            duel_id INTEGER NOT NULL,
            stain_id TEXT NOT NULL,
            x FLOAT NOT NULL,
            y FLOAT NOT NULL,
            color TEXT,
            cleaned_by VARCHAR(255),
            UNIQUE(duel_id, stain_id)
        )`;

        // 8. Game Results (Match History)
        await sql`CREATE TABLE IF NOT EXISTS game_results (
            id SERIAL PRIMARY KEY,
            user_email TEXT,
            score INTEGER,
            duration_seconds INTEGER,
            coins_earned INTEGER,
            played_at TIMESTAMP DEFAULT NOW()
        )`;

        console.log("✅ Database schema sync complete!");
    } catch (e) {
        console.error("❌ DB Sync Error:", e);
        process.exit(1);
    }
}

initDatabase();
