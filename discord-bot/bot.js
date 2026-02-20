// ==========================================
// 🤖 TILO.LIFE Discord Bot — News Auto-Poster
// ==========================================
// ეს ბოტი ყოველ 2 წუთში ამოწმებს ბაზას ახალ სიახლეებზე
// და ავტომატურად აქვეყნებს Discord-ის კონკრეტულ ჩატში.

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { neon } = require('@neondatabase/serverless');

// ============ კონფიგურაცია ============
// ⚠️ ეს მნიშვნელობები შეცვალე!

const CONFIG = {
    // Discord Bot Token (Developer Portal-დან)
    DISCORD_BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',

    // Discord Channel ID (სადაც სიახლეები დაიდება)
    DISCORD_CHANNEL_ID: 'YOUR_CHANNEL_ID_HERE',

    // Neon Database URL (admin.html-ში რომ გაქვს იგივე)
    DATABASE_URL: 'YOUR_NEON_DATABASE_URL_HERE',

    // რამდენ წამში ერთხელ შეამოწმოს (120 = 2 წუთი)
    CHECK_INTERVAL_SECONDS: 120,

    // საიტის URL
    SITE_URL: 'https://tilo.life'
};

// ============ ინიციალიზაცია ============
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const sql = neon(CONFIG.DATABASE_URL);

// ბოლო შემოწმებული სიახლის ID
let lastCheckedId = 0;

// ============ ფუნქციები ============

// ბაზაში ბოლო სიახლეების შემოწმება
async function checkForNewNews() {
    try {
        let news;

        if (lastCheckedId === 0) {
            // პირველი გაშვებისას — უბრალოდ ბოლო ID დავიმახსოვროთ (არაფერი არ გავაგზავნოთ)
            const latest = await sql`SELECT id FROM news ORDER BY id DESC LIMIT 1`;
            if (latest.length > 0) {
                lastCheckedId = latest[0].id;
                console.log(`📌 საწყისი ID: ${lastCheckedId} — ახალ სიახლეებს ველოდები...`);
            }
            return;
        }

        // შემოწმება — გაჩნდა თუ არა ახალი სიახლე
        news = await sql`SELECT * FROM news WHERE id > ${lastCheckedId} ORDER BY id ASC`;

        if (news.length === 0) return;

        console.log(`📰 ${news.length} ახალი სიახლე ნაპოვნია!`);

        const channel = client.channels.cache.get(CONFIG.DISCORD_CHANNEL_ID);
        if (!channel) {
            console.error('❌ ვერ მოიძებნა Discord ჩატი ID-ით:', CONFIG.DISCORD_CHANNEL_ID);
            return;
        }

        for (const item of news) {
            await postNewsToDiscord(channel, item);
            lastCheckedId = item.id;
        }

    } catch (error) {
        console.error('❌ შემოწმების შეცდომა:', error.message);
    }
}

// სიახლის Discord-ზე გამოქვეყნება
async function postNewsToDiscord(channel, newsItem) {
    try {
        // ტექსტიდან HTML ტეგების წაშლა
        const plainContent = newsItem.content
            ? newsItem.content.replace(/<[^>]*>/g, '').substring(0, 400)
            : 'აღწერა არ არის';

        // კატეგორიის ფერის განსაზღვრა
        const categoryColors = {
            'Leak 🔮': 0x9b59b6,     // იასამნისფერი
            'სიახლე': 0x3498db,      // ლურჯი
            'განახლება': 0x2ecc71,    // მწვანე
            'ივენთი': 0xe67e22,      // ნარინჯისფერი
            'default': 0x0066cc       // ლურჯი (default)
        };
        const color = categoryColors[newsItem.category] || categoryColors['default'];

        // Embed შექმნა
        const embed = new EmbedBuilder()
            .setTitle(`🔥 ${newsItem.title}`)
            .setURL(`${CONFIG.SITE_URL}/index.html?id=${newsItem.id}`)
            .setDescription(`${plainContent}\n\n**[👉 სრულად ნახე TILO.LIFE-ზე](${CONFIG.SITE_URL}/index.html?id=${newsItem.id})**`)
            .setColor(color)
            .setFooter({
                text: `TILO.LIFE • ${newsItem.category || 'სიახლე'}`,
                iconURL: `${CONFIG.SITE_URL}/favicon.ico`
            })
            .setTimestamp(new Date(newsItem.created_at));

        // სურათის დამატება (თუ არსებობს)
        if (newsItem.image_url) {
            embed.setImage(newsItem.image_url);
        }

        // გაგზავნა
        await channel.send({
            content: '📢 **ახალი პოსტი დაიდო TILO.LIFE-ზე!** @everyone',
            embeds: [embed]
        });

        console.log(`✅ გაიგზავნა: "${newsItem.title}"`);

    } catch (error) {
        console.error(`❌ გაგზავნის შეცდომა (${newsItem.title}):`, error.message);
    }
}

// ============ ბოტის გაშვება ============

client.once('ready', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   🤖 TILO.LIFE Discord Bot — ONLINE    ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║ ⏱️  შემოწმება: ${CONFIG.CHECK_INTERVAL_SECONDS} წამში ერთხელ`);
    console.log(`║ 📢 ჩატი: ${CONFIG.DISCORD_CHANNEL_ID}`);
    console.log(`║ 🌐 საიტი: ${CONFIG.SITE_URL}`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    // პირველი შემოწმება
    checkForNewNews();

    // პერიოდული შემოწმება
    setInterval(checkForNewNews, CONFIG.CHECK_INTERVAL_SECONDS * 1000);
});

// შეცდომების მოსმენა
client.on('error', (error) => {
    console.error('❌ Discord Error:', error.message);
});

// გაშვება
client.login(CONFIG.DISCORD_BOT_TOKEN).catch(err => {
    console.error('');
    console.error('╔══════════════════════════════════════════════════╗');
    console.error('║ ❌ ბოტის ტოკენი არასწორია ან ცარიელია!          ║');
    console.error('║                                                  ║');
    console.error('║ გაყოლე ეს ნაბიჯები:                             ║');
    console.error('║ 1. discord.com/developers/applications            ║');
    console.error('║ 2. New Application → Bot → Reset Token            ║');
    console.error('║ 3. ტოკენი ჩასვი bot.js-ში CONFIG.DISCORD_BOT_TOKEN ║');
    console.error('║ 4. Bot → SERVER MEMBERS INTENT ჩართე              ║');
    console.error('║ 5. OAuth2 → URL Generator → bot + Send Messages   ║');
    console.error('║ 6. ლინკით დაამატე ბოტი სერვერზე                   ║');
    console.error('╚══════════════════════════════════════════════════╝');
    console.error('');
    console.error('დეტალური შეცდომა:', err.message);
});
