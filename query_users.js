
import { neon } from '@neondatabase/serverless';

const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function checkUsers() {
    try {
        const users = await sql`
            SELECT nickname, score, survival_time, best_score, best_survival_time, is_vip, last_seen 
            FROM users 
            WHERE nickname IS NOT NULL 
            ORDER BY best_score DESC
        `;
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    }
}

checkUsers();
