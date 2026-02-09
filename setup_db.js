const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function setup() {
    console.log("🚀 Starting Database Setup (JavaScript version)...");
    try {
        console.log("🔥 DROPPING ALL EXISTING TABLES FOR CLEAN RESET...");
        await sql`DROP TABLE IF EXISTS game_results`;
        await sql`DROP TABLE IF EXISTS shared_scores`;
        await sql`DROP TABLE IF EXISTS chat_messages`;
        await sql`DROP TABLE IF EXISTS global_events`;
        await sql`DROP TABLE IF EXISTS users`; // Dropping users last due to dependencies if any
        console.log("✅ All tables dropped.");

        // Users Table
        await sql(`CREATE TABLE users (
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
            created_at TIMESTAMP DEFAULT NOW(),
            is_vip BOOLEAN DEFAULT FALSE
        )`);

        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins INTEGER DEFAULT 0`; } catch (e) { }
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_survival_time INTEGER DEFAULT 0`; } catch (e) { }
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW()`; } catch (e) { }
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_survival_time INTEGER DEFAULT 0`; } catch (e) { }
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS survival_time INTEGER DEFAULT 0`; } catch (e) { }

        console.log("✅ Users table ready.");

        // Game Results Table
        await sql(`CREATE TABLE IF NOT EXISTS game_results (
            id SERIAL PRIMARY KEY,
            user_email TEXT,
            score INTEGER NOT NULL,
            duration_seconds INTEGER NOT NULL,
            coins_earned INTEGER NOT NULL,
            played_at TIMESTAMP DEFAULT NOW()
        )`);

        // Ensure 'coins_earned' exists in old tables
        try {
            await sql`ALTER TABLE game_results ADD COLUMN IF NOT EXISTS coins_earned INTEGER DEFAULT 0`;
        } catch (e) { console.log("Note: coins_earned column check failed (might already exist)"); }

        console.log("✅ Game Results table ready.");

        // Shared Scores Table
        await sql(`CREATE TABLE IF NOT EXISTS shared_scores (
            id SERIAL PRIMARY KEY,
            nickname TEXT NOT NULL,
            score INTEGER NOT NULL,
            survival_time INTEGER NOT NULL,
            efficiency FLOAT,
            is_vip BOOLEAN DEFAULT FALSE,
            shared_at TIMESTAMP DEFAULT NOW()
        )`);

        // Ensure 'efficiency' exists in old tables
        try {
            await sql`ALTER TABLE shared_scores ADD COLUMN IF NOT EXISTS efficiency FLOAT DEFAULT 0`;
        } catch (e) { console.log("Note: efficiency column check failed (might already exist)"); }

        console.log("✅ Shared Scores table ready.");

        // Chat Table
        await sql(`CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            nickname TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
        console.log("✅ Chat table ready.");

        // Global Events Table
        await sql(`CREATE TABLE IF NOT EXISTS global_events (
            event_type TEXT PRIMARY KEY,
            event_value TEXT,
            expires_at TIMESTAMP
        )`);
        console.log("✅ Global Events table ready.");

        console.log("\n✨ Setup Successful! Database is ready for Tilo.ge.");
    } catch (e) {
        console.error("❌ Setup Error:", e);
    }
}

setup();
