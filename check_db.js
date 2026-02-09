/**
 * Quick Database Check Script
 * Run this in browser console on admin.html to check database
 */

import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

async function checkDatabase() {
    console.log('🔍 Checking Neon Database...\n');

    try {
        // Check total users
        const totalUsers = await sql`SELECT COUNT(*) as count FROM users`;
        console.log(`✅ Total Users: ${totalUsers[0].count}`);

        // Check registered users
        const registeredUsers = await sql`
            SELECT COUNT(*) as count FROM users 
            WHERE email NOT LIKE 'guest_%'
        `;
        console.log(`✅ Registered Users: ${registeredUsers[0].count}`);

        // Check guest users
        const guestUsers = await sql`
            SELECT COUNT(*) as count FROM users 
            WHERE email LIKE 'guest_%'
        `;
        console.log(`✅ Guest Users: ${guestUsers[0].count}`);

        // Get top 5 players
        console.log('\n🏆 Top 5 Players:');
        const topPlayers = await sql`
            SELECT nickname, email, score, coins, survival_time, is_vip
            FROM users
            WHERE email NOT LIKE 'guest_%'
            ORDER BY score DESC
            LIMIT 5
        `;

        if (topPlayers.length > 0) {
            topPlayers.forEach((player, i) => {
                const vip = player.is_vip ? '👑' : '  ';
                console.log(`${i + 1}. ${vip} ${player.nickname} - Score: ${player.score}, Coins: ${player.coins}`);
            });
        } else {
            console.log('   No registered players found');
        }

        // Check tables
        console.log('\n📊 Database Tables:');
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        tables.forEach(table => {
            console.log(`   - ${table.table_name}`);
        });

        // Check active events
        console.log('\n🎉 Active Global Events:');
        const events = await sql`
            SELECT event_type, event_value, expires_at
            FROM global_events
            WHERE expires_at > NOW()
        `;
        if (events.length > 0) {
            events.forEach(event => {
                console.log(`   - ${event.event_type}: ${event.event_value}`);
            });
        } else {
            console.log('   No active events');
        }

        console.log('\n✅ Database check complete!');
        return {
            totalUsers: totalUsers[0].count,
            registeredUsers: registeredUsers[0].count,
            guestUsers: guestUsers[0].count,
            topPlayers: topPlayers,
            tables: tables.map(t => t.table_name),
            events: events
        };

    } catch (error) {
        console.error('❌ Database Error:', error);
        console.error('Error details:', error.message);
        throw error;
    }
}

// Auto-run
checkDatabase().then(result => {
    console.log('\n📊 Summary:', result);
}).catch(err => {
    console.error('Failed to check database:', err);
});
