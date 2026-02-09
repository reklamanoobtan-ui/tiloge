const { neon } = require('@neondatabase/serverless');
const DATABASE_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function setup() {
    try {
        await sql(`CREATE TABLE IF NOT EXISTS system_logs (
            id SERIAL PRIMARY KEY,
            level TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`);
        console.log("✅ System Logs table created.");
    } catch (e) { console.error(e); }
}
setup();
