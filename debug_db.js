import { neon } from '@neondatabase/serverless';
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function check() {
    console.log("Checking game_results...");
    const res = await sql`SELECT * FROM game_results ORDER BY played_at DESC LIMIT 5`;
    console.log("Latest matches:", res);

    const users = await sql`SELECT nickname, email FROM users ORDER BY last_active DESC LIMIT 5`;
    console.log("Latest active users:", users);
}
check();
