
import { neon } from '@neondatabase/serverless';
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function migrate() {
    try {
        console.log("Dropping UNIQUE constraint on nickname...");
        await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_nickname_key`;
        console.log("Success!");
    } catch (e) {
        console.error("Error dropping constraint:", e);
    }
}

migrate();
