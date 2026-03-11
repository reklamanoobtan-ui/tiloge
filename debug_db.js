const { neon } = require('@neondatabase/serverless');
// Hardcoding connection string for the debug script to avoid .env issues in this context
const DATABASE_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function check() {
    console.log("🔍 Checking Database Contents...\n");

    try {
        // 1. Users (Top 5 by Score)
        console.log("👥 Top 5 Users (by Score):");
        const users = await sql`
            SELECT nickname, email, score, best_score, coins, total_coins, last_active 
            FROM users 
            ORDER BY best_score DESC 
            LIMIT 5`;
        if (users.length === 0) console.log("   (No users found)");
        users.forEach(u => {
            console.log(`   - ${u.nickname} (${u.email}): Best Score: ${u.best_score}, Coins: ${u.coins}, Last Active: ${u.last_active}`);
        });

        // 2. Recent Game Results (Last 5)
        console.log("\n🎮 Recent Game Results (Last 5):");
        const results = await sql`
            SELECT user_email, score, coins_earned, played_at 
            FROM game_results 
            ORDER BY played_at DESC 
            LIMIT 5`;
        if (results.length === 0) console.log("   (No matches recorded yet)");
        results.forEach(r => {
            console.log(`   - ${r.user_email}: Score ${r.score} (+${r.coins_earned} coins) at ${r.played_at}`);
        });

        // 3. Shared Scores (Global Leaderboard Table)
        console.log("\n🌍 Global Leaderboard Entries (Shared Scores - Last 5):");
        const shared = await sql`
            SELECT nickname, score, survival_time, shared_at 
            FROM shared_scores 
            ORDER BY shared_at DESC 
            LIMIT 5`;
        if (shared.length === 0) console.log("   (No shared scores yet)");
        shared.forEach(s => {
            console.log(`   - ${s.nickname}: Score ${s.score} (${s.survival_time}s) shared at ${s.shared_at}`);
        });

    } catch (e) {
        console.error("❌ Error querying database:", e);
    }
}

check();
