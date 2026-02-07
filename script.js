// Safe element getter
const get = (id) => document.getElementById(id);

// Neon Database Config (Serverless Driver)
import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

// IMPORTANT: This is the connection string you provided.
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

// State & Version Control
const APP_VERSION = "2.0.0"; // Increment this to force all clients to reload
let isDragging = false;
let currentX, currentY, initialX, initialY;
let xOffset = 0, yOffset = 0;
let score = 0;
let currentInterval = 10000; // Base: 10 seconds
let sessionSpeedBonus = parseInt(localStorage.getItem('tilo_session_bonus')) || 0;
let activeSpeedBonus = parseInt(localStorage.getItem('tilo_active_speed_bonus'));
if (isNaN(activeSpeedBonus)) activeSpeedBonus = sessionSpeedBonus;
let nickname = localStorage.getItem('tilo_nick') || '';
let userEmail = localStorage.getItem('tilo_email') || '';
let coins = parseInt(localStorage.getItem('tilo_coins')) || 0;
if (isNaN(coins)) coins = 0;

let isVip = localStorage.getItem('tilo_vip') === 'true';
let onlinePlayers = [];
let lbTimeLeft = 10;
let currentTheme = localStorage.getItem('tilo_theme') || 'light';
document.body.className = `theme-${currentTheme}`;

// Shop State
let totalHelpersOwned = parseInt(localStorage.getItem('tilo_total_helpers')) || 0;
let activeHelpers = parseInt(localStorage.getItem('tilo_active_helpers')) || 0;
let totalClothOwned = parseInt(localStorage.getItem('tilo_total_cloth')) || 0;
let activeCloth = parseInt(localStorage.getItem('tilo_active_cloth')) || 0;
let hasKarcher = localStorage.getItem('tilo_has_karcher') === 'true';
let karcherEnabled = localStorage.getItem('tilo_karcher_enabled') !== 'false';
let hasSpeedUp = localStorage.getItem('tilo_has_speedup') === 'true';
let scoreClothLvl = 0;
let scoreHelperLvl = 0;

// Bounds checks
if (activeHelpers > totalHelpersOwned) activeHelpers = totalHelpersOwned;
if (activeCloth > totalClothOwned) activeCloth = totalClothOwned;

// Base stats
let baseClothStrength = 20;
let clothStrength = 0;
let cleaningRadius = 1;

function updatePowerStats() {
    let power = (baseClothStrength + (activeCloth * 15)) * (isVip ? 2 : 1);
    // Score based bonus: +10% per level
    power *= (1 + (scoreClothLvl * 0.1));

    const clothEl = get('cloth');
    if (hasKarcher && karcherEnabled) {
        power *= 2;
        cleaningRadius = 3;
        if (clothEl) clothEl.classList.add('karcher-active');
    } else {
        cleaningRadius = 1;
        if (clothEl) clothEl.classList.remove('karcher-active');
    }
    clothStrength = power;
}

function saveStatsToLocal() {
    localStorage.setItem('tilo_coins', coins);
    localStorage.setItem('tilo_total_helpers', totalHelpersOwned);
    localStorage.setItem('tilo_active_helpers', activeHelpers);
    localStorage.setItem('tilo_total_cloth', totalClothOwned);
    localStorage.setItem('tilo_active_cloth', activeCloth);
    localStorage.setItem('tilo_has_speedup', hasSpeedUp);
    localStorage.setItem('tilo_session_bonus', sessionSpeedBonus);
    localStorage.setItem('tilo_active_speed_bonus', activeSpeedBonus);
    localStorage.setItem('tilo_vip', isVip);
    localStorage.setItem('tilo_has_karcher', hasKarcher);
    localStorage.setItem('tilo_karcher_enabled', karcherEnabled);
}

function updateUIValues() {
    if (get('coins-val')) get('coins-val').textContent = coins;
    if (get('score-val')) get('score-val').textContent = score;
    if (get('score-cloth-lvl')) get('score-cloth-lvl').textContent = scoreClothLvl;
    if (get('score-helper-lvl')) get('score-helper-lvl').textContent = scoreHelperLvl;

    // Settings UI
    if (get('active-helpers')) get('active-helpers').textContent = activeHelpers;
    if (get('total-helpers')) get('total-helpers').textContent = totalHelpersOwned;
    if (get('active-cloth')) get('active-cloth').textContent = activeCloth;
    if (get('total-cloth')) get('total-cloth').textContent = totalClothOwned;

    // Shop UI
    if (get('helper-count')) get('helper-count').textContent = totalHelpersOwned;
    if (get('cloth-level')) get('cloth-level').textContent = totalClothOwned;

    if (get('karcher-status')) {
        if (!hasKarcher) get('karcher-status').textContent = "არ გაქვთ";
        else get('karcher-status').textContent = karcherEnabled ? "ჩართულია" : "გამორთულია";
    }

    // Shop Items - One time purchases
    if (get('buy-speed-btn')) {
        if (!hasSpeedUp) {
            get('buy-speed-btn').textContent = "50 🪙";
            get('buy-speed-btn').disabled = coins < 50;
            get('buy-speed-btn').classList.remove('purchased');
        } else {
            get('buy-speed-btn').textContent = "შეძენილია";
            get('buy-speed-btn').disabled = true;
            get('buy-speed-btn').classList.add('purchased');
        }
    }

    if (get('buy-karcher-btn')) {
        if (hasKarcher) {
            get('buy-karcher-btn').textContent = "შეძენილია";
            get('buy-karcher-btn').disabled = true;
            get('buy-karcher-btn').classList.add('purchased');
        } else {
            get('buy-karcher-btn').textContent = "1000 🪙";
            get('buy-karcher-btn').disabled = false;
            get('buy-karcher-btn').classList.remove('purchased');
        }
    }

    if (get('buy-vip-btn')) {
        if (isVip) {
            get('buy-vip-btn').style.display = 'none';
        } else {
            get('buy-vip-btn').style.display = 'block';
        }
    }

    if (get('active-speed-bonus')) get('active-speed-bonus').textContent = activeSpeedBonus / 1000;

    if (get('interval-val')) {
        let interval = getSpawnInterval();
        get('interval-val').textContent = (interval / 1000).toFixed(6);
    }

    // Admin Access
    if (get('reset-lb-btn')) {
        if (nickname === 'unoobi') get('reset-lb-btn').classList.remove('hidden');
        else get('reset-lb-btn').classList.add('hidden');
    }

    // Profile in Settings
    if (get('settings-user-name')) get('settings-user-name').textContent = nickname || "სტუმარი";
    if (get('settings-user-email')) get('settings-user-email').textContent = userEmail || "";

    if (get('score-cloth-lvl')) get('score-cloth-lvl').textContent = scoreClothLvl;
    if (get('score-helper-lvl')) get('score-helper-lvl').textContent = scoreHelperLvl;

    updateLeaderboardUI();
}

function updateLeaderboardUI() {
    const combined = [...onlinePlayers].sort((a, b) => b.score - a.score);

    const getTitle = (score) => {
        if (score >= 5000) return "🏆 ლეგენდა";
        if (score >= 1000) return "💎 ექსპერტი";
        if (score >= 500) return "✨ ოსტატი";
        if (score >= 100) return "🧼 მწმენდავი";
        return "🌱 დამწყები";
    };

    const getAchvIcons = (p) => {
        let i = '';
        if (p.has_karcher) i += ' 💦';
        if (p.total_helpers > 0) i += ' 🧹';
        if (p.total_cloth > 0) i += ' 🧽';
        return i;
    };

    // Mini HUD Update
    const miniList = get('mini-lb-list');
    if (miniList) {
        miniList.innerHTML = '';
        const top10 = combined.slice(0, 10);
        top10.forEach((entry, i) => {
            const isMe = entry.nickname === nickname;
            const item = document.createElement('div');
            item.className = 'mini-lb-item';
            if (isMe) item.style.background = "rgba(255, 204, 0, 0.2)";

            let rankSymbol = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `#${i + 1}`));
            item.innerHTML = `
                <div class="mini-lb-content" style="display: flex; flex-direction: column;">
                    <span class="mini-lb-name">${rankSymbol} ${entry.is_vip ? '👑' : ''}${entry.nickname}${getAchvIcons(entry)}</span>
                    <span class="mini-lb-title" style="font-size: 0.6rem; opacity: 0.7; margin-left: 25px;">${getTitle(entry.score)}</span>
                </div>
                <span class="mini-lb-score">${Math.floor(entry.score)}</span>
            `;
            miniList.appendChild(item);
        });
    }

    // Modal List
    const list = get('leaderboard-list');
    if (list && get('leaderboard-modal') && !get('leaderboard-modal').classList.contains('hidden')) {
        list.innerHTML = '';
        combined.slice(0, 10).forEach((entry, i) => {
            const isMe = entry.nickname === nickname;
            const item = document.createElement('div');
            item.className = 'lb-item';
            if (isMe) item.style.fontWeight = "bold";

            if (i === 0) item.style.color = "#FFD700";
            else if (i === 1) item.style.color = "#C0C0C0";
            else if (i === 2) item.style.color = "#CD7F32";
            else if (entry.is_vip) item.style.color = "#ff8c00";

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="lb-rank">#${i + 1}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span>${entry.is_vip ? '👑 ' : ''}${entry.nickname}${getAchvIcons(entry)}</span>
                        <span style="font-size: 0.7rem; opacity: 0.6;">${getTitle(entry.score)}</span>
                    </div>
                </div>
                <span>${Math.floor(entry.score)}</span>
            `;
            list.appendChild(item);
        });
    }
}

// Database Initialization & Config
async function initDatabase() {
    try {
        // 1. Ensure schema is correct (Reset Complete)
        // await sql`DROP TABLE IF EXISTS users CASCADE`;

        await sql`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            nickname TEXT UNIQUE,
            score INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            is_vip BOOLEAN DEFAULT false,
            total_helpers INTEGER DEFAULT 0,
            total_cloth INTEGER DEFAULT 0,
            has_karcher BOOLEAN DEFAULT false,
            has_speedup BOOLEAN DEFAULT false,
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        try {
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`;
        } catch (e) { }

        // Score levels are now session-based, no ALTER needed

        await sql`CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`;

        // 3. Update Sync Version in DB
        await sql`INSERT INTO system_config (key, value) VALUES ('app_version', ${APP_VERSION})
                  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

    } catch (e) { console.error("DB Init Error", e); }
}

async function checkForUpdates() {
    try {
        const result = await sql`SELECT value FROM system_config WHERE key = 'app_version'`;
        if (result.length > 0 && result[0].value !== APP_VERSION) {
            console.log("New version detected! Reloading...");
            location.reload();
        }
    } catch (e) { console.error("Update Check Error", e); }
}

async function handleRegister() {
    const email = get('auth-email').value.trim();
    const pass = get('auth-password').value.trim();
    const nick = get('nickname-input').value.trim();
    const err = get('auth-error');

    if (!email || !pass || !nick) { err.textContent = "შეავსეთ ყველა ველი!"; return; }

    try {
        await sql`INSERT INTO users (email, password, nickname, coins, is_vip, total_helpers, total_cloth, has_karcher, has_speedup) 
                  VALUES (${email}, ${pass}, ${nick}, ${coins}, ${isVip}, ${totalHelpersOwned}, ${totalClothOwned}, ${hasKarcher}, ${hasSpeedUp})`;

        // Auto-login after registration
        nickname = nick;
        userEmail = email;
        localStorage.setItem('tilo_nick', nickname);
        localStorage.setItem('tilo_email', userEmail);

        err.style.color = "#4caf50";
        err.textContent = "რეგისტრაცია წარმატებულია! შევდივარ...";

        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        console.error("Register Error:", e);
        err.style.color = "#ff4d4d";
        err.textContent = "ელ-ფოსტა ან ნიკნეიმი უკვე დაკავებულია.";
    }
}

async function handleLogin() {
    const email = get('auth-email').value.trim();
    const pass = get('auth-password').value.trim();
    const err = get('auth-error');

    try {
        const result = await sql`SELECT * FROM users WHERE email = ${email} AND password = ${pass}`;
        if (result.length > 0) {
            const user = result[0];
            nickname = user.nickname;
            userEmail = user.email;
            score = user.score;
            coins = user.coins;
            isVip = user.is_vip;
            totalHelpersOwned = user.total_helpers;
            totalClothOwned = user.total_cloth;
            hasKarcher = user.has_karcher;
            hasSpeedUp = user.has_speedup;

            // Update Local Storage
            localStorage.setItem('tilo_nick', nickname);
            localStorage.setItem('tilo_email', userEmail);
            localStorage.setItem('tilo_coins', coins);
            localStorage.setItem('tilo_vip', isVip);
            localStorage.setItem('tilo_total_helpers', totalHelpersOwned);
            localStorage.setItem('tilo_active_helpers', totalHelpersOwned);
            localStorage.setItem('tilo_total_cloth', totalClothOwned);
            localStorage.setItem('tilo_active_cloth', totalClothOwned);
            localStorage.setItem('tilo_has_karcher', hasKarcher);
            localStorage.setItem('tilo_has_speedup', hasSpeedUp);

            updateUIValues();
            location.reload();
        } else {
            err.textContent = "არასწორი მონაცემები!";
        }
    } catch (e) {
        err.textContent = "შეცდომა ბაზასთან კავშირისას.";
    }
}

let syncTimeout;
async function syncUserData() {
    if (!userEmail) return;

    // Debounce sync to prevent lag
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        try {
            await sql`UPDATE users SET 
                score = ${score}, 
                coins = ${coins}, 
                is_vip = ${isVip},
                total_helpers = ${totalHelpersOwned},
                total_cloth = ${totalClothOwned},
                has_karcher = ${hasKarcher},
                has_speedup = ${hasSpeedUp},
                last_seen = NOW()
                WHERE email = ${userEmail}`;
        } catch (e) { console.error("Neon Sync Error", e); }
    }, 1000);
}

async function fetchLeaderboard() {
    try {
        const result = await sql`SELECT nickname, score, is_vip, total_helpers, total_cloth, has_karcher FROM users ORDER BY score DESC LIMIT 20`;
        onlinePlayers = result;
        updateLeaderboardUI();

        // Fetch online count (seen in last 30s)
        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '30 seconds'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;
    } catch (e) { console.error("Neon Fetch Error", e); }
}

function updateScore(points) {
    if (points > 0) {
        const oldScore = score;
        score += points;

        if (Math.floor(score / 1000) > Math.floor(oldScore / 1000)) {
            coins += Math.floor(score / 1000) - Math.floor(oldScore / 1000);
            saveStatsToLocal();
            showStatusUpdate("+1 🪙 ქულებისათვის!");
        }
        updateUIValues();
        syncUserData();
    }
}

function showStatusUpdate(text) {
    const ds = get('diff-status');
    if (!ds) return;
    ds.textContent = text;
    ds.style.color = '#ffcc00';
    setTimeout(() => {
        ds.textContent = nickname ? `მოთამაშე: ${nickname}` : 'გამოიყენეთ ტილო საიტის გასაწმენდად';
        ds.style.color = '';
    }, 3000);
}

function initUI() {
    get('buy-vip-btn').onclick = () => {
        if (confirm("გსურთ VIP სტატუსის შეძენა 2 ლარად?")) {
            isVip = true; updatePowerStats(); saveStatsToLocal(); syncUserData();
            if (get('cloth')) get('cloth').classList.add('vip-cloth');
            if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
            get('buy-vip-btn').style.display = 'none';
            updateUIValues();
        }
    };

    get('shop-btn').onclick = () => get('shop-modal').classList.remove('hidden');
    get('close-shop').onclick = () => get('shop-modal').classList.add('hidden');
    get('settings-btn').onclick = () => get('settings-modal').classList.remove('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('buy-helper-btn').onclick = () => {
        if (coins >= 100 && totalHelpersOwned < 10) {
            coins -= 100; totalHelpersOwned++; activeHelpers++;
            saveStatsToLocal(); updateUIValues(); syncUserData(); startHelperBot();
        }
    };

    get('buy-speed-btn').onclick = () => {
        if (!hasSpeedUp) {
            // First time permanent buy
            if (coins >= 50) {
                coins -= 50; hasSpeedUp = true;
                saveStatsToLocal(); updateUIValues(); syncUserData();
                showStatusUpdate("მუდმივი აჩქარება მიღებულია!");
                get('buy-speed-btn').textContent = "შეძენილია";
                get('buy-speed-btn').classList.add('purchased');
            }
        }
    };

    get('buy-cloth-power-btn').onclick = () => {
        if (coins >= 70 && totalClothOwned < 10) {
            coins -= 70; totalClothOwned++; activeCloth++;
            updatePowerStats(); saveStatsToLocal(); updateUIValues(); syncUserData();
        }
    };

    get('buy-karcher-btn').onclick = () => {
        if (coins >= 1000 && !hasKarcher) {
            coins -= 1000; hasKarcher = true; karcherEnabled = true;
            updatePowerStats(); saveStatsToLocal(); updateUIValues(); syncUserData();
            get('buy-karcher-btn').textContent = "შეძენილია"; get('buy-karcher-btn').disabled = true;
        }
    };

    // Settings adjustments
    get('set-dec-helper').onclick = () => {
        if (activeHelpers > 0) {
            activeHelpers--; saveStatsToLocal(); updateUIValues();
            const bots = document.querySelectorAll('.helper-bot');
            if (bots.length > 0) bots[bots.length - 1].remove();
        }
    };
    get('set-inc-helper').onclick = () => {
        if (activeHelpers < totalHelpersOwned) { activeHelpers++; saveStatsToLocal(); updateUIValues(); startHelperBot(); }
    };
    get('set-dec-cloth').onclick = () => { if (activeCloth > 0) { activeCloth--; updatePowerStats(); saveStatsToLocal(); updateUIValues(); } };
    get('set-dec-speed').onclick = () => {
        if (activeSpeedBonus >= 1000) { activeSpeedBonus -= 1000; saveStatsToLocal(); updateUIValues(); }
    };
    get('set-inc-speed').onclick = () => {
        if (activeSpeedBonus < sessionSpeedBonus) { activeSpeedBonus += 1000; saveStatsToLocal(); updateUIValues(); }
    };

    get('toggle-karcher-btn').onclick = () => {
        if (hasKarcher) { karcherEnabled = !karcherEnabled; updatePowerStats(); saveStatsToLocal(); updateUIValues(); }
    };

    get('reset-lb-btn').onclick = async () => {
        if (nickname === 'unoobi' && confirm("ნამდვილად გსურთ რეიტინგის გასუფთავება?")) {
            try {
                await sql`UPDATE users SET score = 0`;
                // Force global reload
                const nextVer = (parseFloat(APP_VERSION) + 0.01).toFixed(2);
                await sql`UPDATE system_config SET value = ${nextVer} WHERE key = 'app_version'`;
                alert("რეიტინგი გასუფთავდა! ყველა მომხმარებელი დარეფრეშდება.");
                location.reload();
            } catch (e) { alert("შეცდომა!"); }
        }
    };

    get('upgrade-cloth-score-btn').onclick = () => {
        if (score >= 100) {
            score -= 100; scoreClothLvl++;
            updatePowerStats(); saveStatsToLocal(); updateUIValues(); syncUserData();
            showStatusUpdate("ტილო გაძლიერდა! 💪");
        } else {
            showStatusUpdate("არ გაქვთ საკმარისი ქულები! 🎯");
        }
    };

    get('upgrade-helper-score-btn').onclick = () => {
        if (score >= 100) {
            score -= 100; scoreHelperLvl++;
            saveStatsToLocal(); updateUIValues(); syncUserData();
            showStatusUpdate("დამხმარეები გაძლიერდნენ! 🤖");
        } else {
            showStatusUpdate("არ გაქვთ საკმარისი ქულები! 🎯");
        }
    };


    // Donation logic
    document.querySelectorAll('.buy-coins-btn').forEach(btn => {
        btn.onclick = () => {
            const amount = parseInt(btn.dataset.coins);
            if (confirm(`გსურთ ${amount} ქოინის ყიდვა?`)) {
                coins += amount;
                saveStatsToLocal(); updateUIValues(); syncUserData();
                alert("ქოინები დაემატა!");
            }
        };
    });

    get('donate-btn').onclick = () => get('donate-modal').classList.remove('hidden');
    get('close-donate').onclick = () => get('donate-modal').classList.add('hidden');

    // Promo Code Logic
    get('apply-promo-btn').onclick = () => {
        const input = get('promo-input').value.trim().toLowerCase();
        const msg = get('promo-msg');
        if (input === 'baro') {
            const usedPromos = JSON.parse(localStorage.getItem('tilo_used_promos') || "[]");
            if (usedPromos.includes('baro')) {
                msg.textContent = "კოდი უკვე გამოყენებულია!";
                msg.style.color = "#ff4d4d";
            } else {
                coins += 5000;
                usedPromos.push('baro');
                localStorage.setItem('tilo_used_promos', JSON.stringify(usedPromos));
                saveStatsToLocal();
                updateUIValues();
                syncUserData();
                msg.textContent = "კოდი გააქტიურდა! +5000 🪙";
                msg.style.color = "#4caf50";
                get('promo-input').value = "";
            }
        } else {
            msg.textContent = "არასწორი კოდი!";
            msg.style.color = "#ff4d4d";
        }
    };

    // Auth Actions
    get('register-btn').onclick = handleRegister;
    get('login-btn').onclick = handleLogin;
    get('logout-btn').onclick = () => {
        if (confirm("ნამდვილად გსურთ გასვლა?")) {
            localStorage.clear();
            location.reload();
        }
    };

    // Theme logic
    get('themes-btn').onclick = () => get('themes-modal').classList.remove('hidden');
    get('close-themes').onclick = () => get('themes-modal').classList.add('hidden');

    document.querySelectorAll('.theme-opt').forEach(opt => {
        opt.onclick = () => {
            const theme = opt.dataset.theme;
            currentTheme = theme;
            document.body.className = `theme-${theme}`;
            localStorage.setItem('tilo_theme', theme);

            // UI Update
            document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        };
        // Set initial active
        if (opt.dataset.theme === currentTheme) opt.classList.add('active');
    });

    get('leaderboard-btn').onclick = () => { updateLeaderboardUI(); get('leaderboard-modal').classList.remove('hidden'); };
    get('close-leaderboard').onclick = () => get('leaderboard-modal').classList.add('hidden');
}

function startHelperBot() {
    const container = get('canvas-container');
    const botEl = document.createElement('div');
    botEl.className = 'helper-bot';
    container.appendChild(botEl);

    function moveBot() {
        if (!botEl.parentElement) return;
        const stains = document.querySelectorAll('.stain');
        if (stains.length > 0) {
            const target = stains[Math.floor(Math.random() * Math.min(stains.length, 3))];
            const rect = target.getBoundingClientRect();
            botEl.style.left = `${rect.left}px`; botEl.style.top = `${rect.top}px`;

            // Speed boost per level: 10% faster (shorter timeout)
            const baseDelay = 1000;
            const delay = baseDelay / (1 + (scoreHelperLvl * 0.1));

            setTimeout(() => {
                if (target.parentElement) {
                    target.dataset.health = 0;
                    checkCleaningAtPos(rect.left + 30, rect.top + 30);
                }
            }, delay);
        } else {
            botEl.style.left = `${Math.random() * (window.innerWidth - 60)}px`;
            botEl.style.top = `${Math.random() * (window.innerHeight - 60)}px`;
        }
        setTimeout(moveBot, 2000);
    }
    moveBot();
}

function checkCleaningAtPos(x, y) {
    const stains = document.querySelectorAll('.stain');
    stains.forEach(stain => {
        if (stain.dataset.cleaning === 'true') return;
        const rect = stain.getBoundingClientRect();
        if (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom) {
            stain.dataset.cleaning = 'true'; stain.style.opacity = '0';
            createParticles(x, y, stain.style.backgroundColor);
            setTimeout(() => stain.remove(), 800);
            updateScore(1);
        }
    });
}

function createStain() {
    const container = get('canvas-container');
    const stain = document.createElement('div');
    stain.className = 'stain';
    let health = 100;
    const types = [
        { name: 'coffee', color: 'rgba(111, 78, 55, 0.4)', blur: '10px' },
        { name: 'ink', color: 'rgba(0, 0, 128, 0.3)', blur: '5px' },
        { name: 'grease', color: 'rgba(150, 150, 100, 0.2)', blur: '15px' }
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const size = Math.random() * 80 + 40;
    const posX = Math.random() * (window.innerWidth - size);
    const posY = Math.random() * (window.innerHeight - size);
    stain.style.width = `${size}px`; stain.style.height = `${size}px`;
    stain.style.left = `${posX}px`; stain.style.top = `${posY}px`;
    stain.style.backgroundColor = type.color;
    stain.style.filter = `blur(${type.blur})`;
    stain.style.borderRadius = `${30 + Math.random() * 70}% ${30 + Math.random() * 70}% ${30 + Math.random() * 70}% ${30 + Math.random() * 70}%`;
    stain.dataset.health = health; stain.dataset.maxHealth = health;
    container.appendChild(stain);
}

function checkCleaning() {
    const cloth = get('cloth');
    if (!cloth) return;
    const clothRect = cloth.getBoundingClientRect();
    const cx = clothRect.left + clothRect.width / 2;
    const cy = clothRect.top + clothRect.height / 2;
    const radius = (clothRect.width / 2) * cleaningRadius;
    const stains = document.querySelectorAll('.stain');
    stains.forEach(stain => {
        if (stain.dataset.cleaning === 'true') return;
        const rect = stain.getBoundingClientRect();
        const sx = rect.left + rect.width / 2; const sy = rect.top + rect.height / 2;
        const dist = Math.sqrt(Math.pow(cx - sx, 2) + Math.pow(cy - sy, 2));
        if (dist < radius + rect.width / 2) {
            let h = parseFloat(stain.dataset.health);
            h -= clothStrength; stain.dataset.health = h;
            stain.style.opacity = Math.max(0.2, h / parseFloat(stain.dataset.maxHealth));
            if (h <= 0) {
                stain.dataset.cleaning = 'true'; stain.style.opacity = '0';
                createParticles(sx, sy, stain.style.backgroundColor);
                setTimeout(() => stain.remove(), 800);
                updateScore(1);
            }
        }
    });
}

function createParticles(x, y, color) {
    const container = get('canvas-container');
    const isKarcherActive = hasKarcher && karcherEnabled;
    const count = isKarcherActive ? 8 : 4;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        if (isKarcherActive) {
            p.className = 'water-splash';
            const size = Math.random() * 10 + 5;
            p.style.width = `${size}px`; p.style.height = `${size}px`;
            p.style.left = `${x}px`; p.style.top = `${y}px`;
        } else {
            p.style.position = 'absolute'; p.style.left = `${x}px`; p.style.top = `${y}px`;
            p.style.width = '6px'; p.style.height = '6px'; p.style.backgroundColor = color;
            p.style.borderRadius = '50%';
        }
        p.style.pointerEvents = 'none'; container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * (isKarcherActive ? 100 : 40);
        const tx = Math.cos(angle) * velocity; const ty = Math.sin(angle) * velocity;
        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px,${ty}px) scale(0)`, opacity: 0 }
        ], { duration: isKarcherActive ? 800 : 600 }).onfinish = () => p.remove();
    }
}

function getSpawnInterval() {
    // Start at 10s. If hasSpeedUp, start at 5s.
    let base = hasSpeedUp ? 5000 : 10000;

    // Every 10 points, decrease speed by 0.1 second (100ms)
    let speedBonus = Math.floor(score / 10) * 100;
    let interval = base - speedBonus - activeSpeedBonus;

    // Apply VIP bonus (half interval)
    if (isVip) interval = interval / 2;

    // Minimum cap: 0.05 seconds (50ms)
    return Math.max(50, interval);
}

function scheduleNextStain() {
    setTimeout(() => { createStain(); scheduleNextStain(); }, getSpawnInterval());
}

function centerCloth() {
    const cloth = get('cloth');
    if (!cloth) return;
    const r = cloth.getBoundingClientRect();
    xOffset = window.innerWidth / 2 - r.width / 2; yOffset = window.innerHeight / 2 - r.height / 2;
    setTranslate(xOffset, yOffset, cloth);
}

function setTranslate(x, y, el) { if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`; }

function dragStart(e) {
    const cx = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const cy = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    initialX = cx - xOffset; initialY = cy - yOffset;
    const cloth = get('cloth');
    if (e.target === cloth || (cloth && cloth.contains(e.target))) {
        isDragging = true;
        this.lastX = undefined; this.lastY = undefined;
    }
}
function dragEnd() { if (currentX !== undefined) initialX = currentX; if (currentY !== undefined) initialY = currentY; isDragging = false; }
function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const cx = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const cy = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        currentX = cx - initialX; currentY = cy - initialY;
        xOffset = currentX; yOffset = currentY;
        const cloth = get('cloth');

        let transform = `translate3d(${currentX}px, ${currentY}px, 0)`;

        if (hasKarcher && karcherEnabled) {
            if (this.lastX !== undefined) {
                const dx = cx - this.lastX;
                const dy = cy - this.lastY;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    transform += ` rotate(${angle}deg)`;
                }
            }
            this.lastX = cx; this.lastY = cy;
        }

        if (cloth) cloth.style.transform = transform;
        checkCleaning();
    }
}

window.addEventListener('load', async () => {
    await initDatabase();

    // Reset score on refresh (Session-based leaderboard)
    score = 0;
    sessionSpeedBonus = 0;
    activeSpeedBonus = 0; // Reset all session speed bonuses
    scoreClothLvl = 0;
    scoreHelperLvl = 0; // Reset score-based upgrades on refresh
    localStorage.setItem('tilo_session_bonus', 0);
    localStorage.setItem('tilo_active_speed_bonus', 0);
    localStorage.setItem('tilo_score_cloth_lvl', 0);
    localStorage.setItem('tilo_score_helper_lvl', 0);

    if (userEmail) {
        try {
            await sql`UPDATE users SET score = 0 WHERE email = ${userEmail}`;
        } catch (e) { console.error("Score Reset Error", e); }
        get('auth-modal').classList.add('hidden');
    } else {
        get('auth-modal').classList.remove('hidden');
    }

    updatePowerStats();
    initUI();
    centerCloth();
    updateUIValues();

    if (isVip) {
        if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
        if (get('buy-vip-btn')) get('buy-vip-btn').style.display = 'none';
        if (get('cloth')) get('cloth').classList.add('vip-cloth');
    }

    fetchLeaderboard();
    setInterval(() => {
        lbTimeLeft--;
        if (lbTimeLeft <= 0) {
            fetchLeaderboard();
            lbTimeLeft = 10;
        }
        if (get('lb-timer')) get('lb-timer').textContent = `(${lbTimeLeft}წ)`;
    }, 1000);
    setInterval(checkForUpdates, 30000); // Check for global updates every 30s
    setInterval(() => { if (userEmail) syncUserData(); }, 15000); // Heartbeat for online status

    for (let i = 0; i < activeHelpers; i++) startHelperBot();
    scheduleNextStain();

    // Continuous cleaning loop (runs even if not dragging)
    setInterval(checkCleaning, 200);
});

window.addEventListener("mousedown", dragStart); window.addEventListener("mouseup", dragEnd); window.addEventListener("mousemove", drag);
window.addEventListener("touchstart", dragStart); window.addEventListener("touchend", dragEnd); window.addEventListener("touchmove", drag);
window.addEventListener('resize', centerCloth);
