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

let nickname = localStorage.getItem('tilo_nick') || '';
let userEmail = localStorage.getItem('tilo_email') || '';
let coins = parseInt(localStorage.getItem('tilo_coins')) || 0;
if (isNaN(coins)) coins = 0;

let isVip = localStorage.getItem('tilo_vip') === 'true';
let onlinePlayers = [];
let lbTimeLeft = 10;
let currentTheme = localStorage.getItem('tilo_theme') || 'light';
document.body.className = `theme-${currentTheme}`;

// Game State (Survival & Bosses)
let startTime = Date.now();
let totalStainsCleaned = 0;
let bossCount = 0;
let defeatTimer = null;
let lastBestScore = JSON.parse(localStorage.getItem('tilo_best_score')) || { score: 0, time: 0 };
let lastPrevScore = JSON.parse(localStorage.getItem('tilo_prev_score')) || { score: 0, time: 0 };
let nextUpgradeScore = 10;
let gameActive = true;

// Shop State
let totalHelpersOwned = parseInt(localStorage.getItem('tilo_total_helpers')) || 0;
let activeHelpers = parseInt(localStorage.getItem('tilo_active_helpers')) || 0;
let hasSpinUpgrade = localStorage.getItem('tilo_has_spin') === 'true';
let hasKarcher = localStorage.getItem('tilo_has_karcher') === 'true';
let karcherEnabled = localStorage.getItem('tilo_karcher_enabled') !== 'false';

// New Shop Levels (Permanent)
let clothPowerLevel = parseInt(localStorage.getItem('tilo_strength_lvl')) || 0;
let permSpeedLevel = parseInt(localStorage.getItem('tilo_speed_lvl')) || 0;

// Scaling Multipliers (from cards)
let intervalMultiplier = 1.0;
let radiusMultiplier = 1.0;
let strengthMultiplier = 1.0;
let helperSpeedMultiplier = 1.0;

// Base stats
let baseClothStrength = 20;
let clothStrength = 0;
let cleaningRadius = 1;

// --- Helper Functions ---

function updatePowerStats() {
    let power = baseClothStrength * strengthMultiplier * (1 + (clothPowerLevel * 0.1));
    const clothEl = get('cloth');

    if (hasKarcher && karcherEnabled) {
        power *= 2;
        cleaningRadius = 3 * radiusMultiplier;
        if (clothEl) clothEl.classList.add('karcher-active');
    } else {
        cleaningRadius = 1 * radiusMultiplier;
        if (clothEl) clothEl.classList.remove('karcher-active');
    }
    clothStrength = power;
}

function saveStatsToLocal() {
    localStorage.setItem('tilo_coins', coins);
    localStorage.setItem('tilo_total_helpers', totalHelpersOwned);
    localStorage.setItem('tilo_active_helpers', activeHelpers);
    localStorage.setItem('tilo_vip', isVip);
    localStorage.setItem('tilo_has_spin', hasSpinUpgrade);
    localStorage.setItem('tilo_strength_lvl', clothPowerLevel);
    localStorage.setItem('tilo_speed_lvl', permSpeedLevel);
}

function updateUIValues() {
    if (get('coins-val')) get('coins-val').textContent = coins;
    if (get('score-val')) get('score-val').textContent = score;

    // Settings UI
    if (get('active-helpers')) get('active-helpers').textContent = activeHelpers;
    if (get('total-helpers')) get('total-helpers').textContent = totalHelpersOwned;

    // Stats UI
    if (get('best-score-stat')) get('best-score-stat').textContent = `${lastBestScore.score} stain / ${lastBestScore.time}s`;
    if (get('prev-score-stat')) get('prev-score-stat').textContent = `${lastPrevScore.score} stain / ${lastPrevScore.time}s`;

    const updateBtn = (id, price, owned = false) => {
        const btn = get(id);
        if (!btn) return;
        if (owned) {
            btn.textContent = "შეძენილია";
            btn.disabled = true;
            btn.classList.add('purchased');
        } else {
            btn.textContent = `${price} 🪙`;
            btn.disabled = coins < price;
            btn.classList.remove('purchased');
        }
    };

    updateBtn('buy-spin-btn', 500, hasSpinUpgrade);
    updateBtn('buy-helper-btn', 2000, totalHelpersOwned >= 10);
    updateBtn('buy-strength-btn', 1000 + (clothPowerLevel * 500), clothPowerLevel >= 10);
    updateBtn('buy-perm-speed-btn', 5000 + (permSpeedLevel * 1000), permSpeedLevel >= 10);

    if (get('interval-val')) {
        let interval = getSpawnInterval();
        get('interval-val').textContent = (interval / 1000).toFixed(2);
    }
}

// --- Database & Auth ---

async function initDatabase() {
    try {
        await sql`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            password TEXT,
            nickname TEXT UNIQUE,
            score INTEGER DEFAULT 0,
            survival_time INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 0,
            is_vip BOOLEAN DEFAULT false,
            total_helpers INTEGER DEFAULT 0,
            has_karcher BOOLEAN DEFAULT false,
            has_spin BOOLEAN DEFAULT false,
            strength_lvl INTEGER DEFAULT 0,
            speed_lvl INTEGER DEFAULT 0,
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        try {
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS strength_lvl INTEGER DEFAULT 0`;
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS speed_lvl INTEGER DEFAULT 0`;
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`;
        } catch (e) { }

        await sql`CREATE TABLE IF NOT EXISTS system_config (
            key TEXT PRIMARY KEY,
            value TEXT
        )`;

        await sql`CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            nickname TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

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
    } catch (e) { }
}

async function handleRegister() {
    const email = get('auth-email').value.trim();
    const pass = get('auth-password').value.trim();
    const nick = get('nickname-input').value.trim();
    const err = get('auth-error');

    if (!email || !pass || !nick) { err.textContent = "შეავსეთ ყველა ველი!"; return; }

    try {
        await sql`INSERT INTO users (email, password, nickname, coins, is_vip, total_helpers, has_karcher, has_spin, strength_lvl, speed_lvl) 
                  VALUES (${email}, ${pass}, ${nick}, ${coins}, ${isVip}, ${totalHelpersOwned}, ${hasKarcher}, ${hasSpinUpgrade}, ${clothPowerLevel}, ${permSpeedLevel})`;

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
            hasKarcher = user.has_karcher;
            hasSpinUpgrade = user.has_spin;
            clothPowerLevel = user.strength_lvl || 0;
            permSpeedLevel = user.speed_lvl || 0;

            localStorage.setItem('tilo_nick', nickname);
            localStorage.setItem('tilo_email', userEmail);
            localStorage.setItem('tilo_coins', coins);
            localStorage.setItem('tilo_vip', isVip);
            localStorage.setItem('tilo_total_helpers', totalHelpersOwned);
            localStorage.setItem('tilo_has_karcher', hasKarcher);
            localStorage.setItem('tilo_has_spin', hasSpinUpgrade);
            localStorage.setItem('tilo_strength_lvl', clothPowerLevel);
            localStorage.setItem('tilo_speed_lvl', permSpeedLevel);

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
    if (!userEmail || !gameActive) return;

    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        try {
            const currentSurvival = Math.floor((Date.now() - startTime) / 1000);
            await sql`UPDATE users SET 
                score = GREATEST(score, ${score}), 
                survival_time = GREATEST(survival_time, ${currentSurvival}),
                coins = ${coins}, 
                is_vip = ${isVip},
                total_helpers = ${totalHelpersOwned},
                has_karcher = ${hasKarcher},
                has_spin = ${hasSpinUpgrade},
                strength_lvl = ${clothPowerLevel},
                speed_lvl = ${permSpeedLevel},
                last_seen = NOW()
                WHERE email = ${userEmail}`;
        } catch (e) { console.error("Neon Sync Error", e); }
    }, 1000);
}

async function fetchLeaderboard() {
    try {
        const result = await sql`SELECT nickname, score, survival_time, is_vip FROM users ORDER BY score DESC, survival_time DESC LIMIT 50`;
        onlinePlayers = result;
        updateLeaderboardUI();

        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '30 seconds'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;
    } catch (e) { console.error("LB Fetch Error", e); }
}

function updateLeaderboardUI() {
    const combined = [...onlinePlayers].sort((a, b) => b.score - a.score);
    const list = get('leaderboard-list');
    if (list && get('leaderboard-modal') && !get('leaderboard-modal').classList.contains('hidden')) {
        list.innerHTML = '';
        combined.slice(0, 50).forEach((entry, i) => {
            const isMe = entry.nickname === nickname;
            const item = document.createElement('div');
            item.className = 'lb-item';
            if (isMe) item.style.fontWeight = "bold";
            if (entry.is_vip) item.classList.add('vip-rainbow-text');
            const timeVal = entry.survival_time || 0;
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="lb-rank">#${i + 1}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span>${entry.is_vip ? '👑 ' : ''}${entry.nickname}</span>
                        <span style="font-size: 0.7rem; opacity: 0.6;">${timeVal}წ გადარჩენა</span>
                    </div>
                </div>
                <span>${Math.floor(entry.score)} ✨</span>
            `;
            list.appendChild(item);
        });
    }
}

// --- Game Logic ---

function updateScore(points) {
    if (!gameActive) return;
    if (points > 0) {
        score += points;
        totalStainsCleaned += points;

        // Upgrade Check (10, 20, 40, 80...)
        if (score >= nextUpgradeScore) {
            showUpgradeOptions();
            nextUpgradeScore *= 2;
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
    }, 2000);
}

function initUI() {
    get('buy-spin-btn').onclick = () => {
        if (coins >= 500 && !hasSpinUpgrade) {
            coins -= 500;
            hasSpinUpgrade = true;
            saveStatsToLocal();
            updateUIValues();
            syncUserData();
            showStatusUpdate("სატრიალო ფუნქცია შეძენილია! 🌀");
        }
    };

    get('buy-helper-btn').onclick = () => {
        if (coins >= 2000 && totalHelpersOwned < 10) {
            coins -= 2000;
            totalHelpersOwned++;
            activeHelpers++;
            startHelperBot();
            saveStatsToLocal();
            updateUIValues();
            syncUserData();
            showStatusUpdate("დამხმარე რობოტი შეძენილია! 🤖");
        }
    };

    get('buy-strength-btn').onclick = () => {
        const price = 1000 + (clothPowerLevel * 500);
        if (coins >= price && clothPowerLevel < 10) {
            coins -= price;
            clothPowerLevel++;
            updatePowerStats();
            saveStatsToLocal();
            updateUIValues();
            syncUserData();
            showStatusUpdate("ტილო გაძლიერდა! 💪");
        }
    };

    get('buy-perm-speed-btn').onclick = () => {
        const price = 5000 + (permSpeedLevel * 1000);
        if (coins >= price && permSpeedLevel < 10) {
            coins -= price;
            permSpeedLevel++;
            saveStatsToLocal();
            updateUIValues();
            syncUserData();
            showStatusUpdate("მუდმივი აჩქარება გააქტიურდა! ⏩");
        }
    };

    get('shop-btn').onclick = () => get('shop-modal').classList.remove('hidden');
    get('close-shop').onclick = () => get('shop-modal').classList.add('hidden');
    get('settings-btn').onclick = () => get('settings-modal').classList.remove('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('restart-game-btn').onclick = () => {
        location.reload();
    };

    // Settings adjustments
    get('set-dec-helper').onclick = () => {
        if (activeHelpers > 0) {
            activeHelpers--;
            saveStatsToLocal();
            updateUIValues();
            const bots = document.querySelectorAll('.helper-bot');
            if (bots.length > 0) bots[bots.length - 1].remove();
        }
    };
    get('set-inc-helper').onclick = () => {
        if (activeHelpers < totalHelpersOwned) {
            activeHelpers++;
            saveStatsToLocal();
            updateUIValues();
            startHelperBot();
        }
    };

    // Donation logic
    document.querySelectorAll('.buy-coins-btn').forEach(btn => {
        btn.onclick = () => {
            const amount = parseInt(btn.dataset.coins);
            if (confirm(`გსურთ ${amount} ქოინის ყიდვა?`)) {
                coins += amount;
                saveStatsToLocal();
                updateUIValues();
                syncUserData();
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

            document.querySelectorAll('.theme-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        };
        if (opt.dataset.theme === currentTheme) opt.classList.add('active');
    });

    get('leaderboard-btn').onclick = () => {
        updateLeaderboardUI();
        get('leaderboard-modal').classList.remove('hidden');
    };
    get('close-leaderboard').onclick = () => get('leaderboard-modal').classList.add('hidden');
}

function setupChat() {
    const chatContainer = get('global-chat');
    const chatInput = get('chat-input');
    const sendBtn = get('send-chat-btn');

    // Drag Logic
    let isDraggingChat = false;
    let chatOffsetX, chatOffsetY;

    function onChatDrag(e) {
        if (!isDraggingChat) return;
        e.preventDefault();
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

        let x = clientX - chatOffsetX;
        let y = clientY - chatOffsetY;

        x = Math.max(0, Math.min(window.innerWidth - chatContainer.clientWidth, x));
        y = Math.max(0, Math.min(window.innerHeight - chatContainer.clientHeight, y));

        chatContainer.style.left = `${x}px`;
        chatContainer.style.top = `${y}px`;
        chatContainer.style.right = 'auto';
    }

    function stopChatDrag() {
        isDraggingChat = false;
        chatContainer.style.cursor = 'move';
        document.removeEventListener('mousemove', onChatDrag);
        document.removeEventListener('mouseup', stopChatDrag);
        document.removeEventListener('touchmove', onChatDrag);
        document.removeEventListener('touchend', stopChatDrag);
    }

    chatContainer.addEventListener('mousedown', (e) => {
        if (e.target === chatInput || e.target === sendBtn) return;
        isDraggingChat = true;
        chatOffsetX = e.clientX - chatContainer.offsetLeft;
        chatOffsetY = e.clientY - chatContainer.offsetTop;
        chatContainer.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onChatDrag);
        document.addEventListener('mouseup', stopChatDrag);
    });

    chatContainer.addEventListener('touchstart', (e) => {
        if (e.target === chatInput || e.target === sendBtn) return;
        isDraggingChat = true;
        chatOffsetX = e.touches[0].clientX - chatContainer.offsetLeft;
        chatOffsetY = e.touches[0].clientY - chatContainer.offsetTop;
        document.addEventListener('touchmove', onChatDrag, { passive: false });
        document.addEventListener('touchend', stopChatDrag);
    });

    async function sendMsg() {
        const text = chatInput.value.trim().substring(0, 50);
        if (!text) return;
        if (!nickname) { alert("ჩათისთვის გაიარეთ ავტორიზაცია!"); return; }

        try {
            await sql`INSERT INTO chat_messages (nickname, message) VALUES (${nickname}, ${text})`;
            chatInput.value = '';
            fetchChat();
        } catch (e) { console.error("Chat Send Error", e); }
    }

    sendBtn.onclick = sendMsg;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };

    // Poll for chat
    setInterval(fetchChat, 3000);
}

async function fetchChat() {
    try {
        const msgs = await sql`SELECT * FROM chat_messages WHERE created_at > NOW() - INTERVAL '30 seconds' ORDER BY created_at ASC`;
        const container = get('chat-messages');
        if (!container) return;
        container.innerHTML = '';
        msgs.forEach(m => {
            const el = document.createElement('div');
            el.className = 'chat-msg';

            const sender = onlinePlayers.find(p => p.nickname === m.nickname);
            const isVipUser = sender ? sender.is_vip : false;
            if (isVipUser) el.classList.add('vip-rainbow-text');

            el.innerHTML = `<strong>${isVipUser ? '👑 ' : ''}${m.nickname}:</strong> ${m.message}`;
            container.appendChild(el);
            container.scrollTop = container.scrollHeight;
        });
    } catch (e) { }
}

function startHelperBot() {
    const container = get('canvas-container');
    const botEl = document.createElement('div');
    botEl.className = 'helper-bot';
    if (isVip) botEl.classList.add('vip-rainbow-trail');
    container.appendChild(botEl);

    function moveBot() {
        if (!botEl.parentElement || !gameActive) return;
        const stains = document.querySelectorAll('.stain');
        if (stains.length > 0) {
            const target = stains[Math.floor(Math.random() * stains.length)];
            const rect = target.getBoundingClientRect();
            const rX = (Math.random() - 0.5) * 30;
            const rY = (Math.random() - 0.5) * 30;

            botEl.style.left = `${rect.left + rX}px`;
            botEl.style.top = `${rect.top + rY}px`;

            const baseDelay = 1500;
            const delay = baseDelay / (1 * helperSpeedMultiplier);
            const randomDelay = delay + (Math.random() * 800);

            setTimeout(() => {
                if (target.parentElement) {
                    let h = parseFloat(target.dataset.health);
                    h -= 50;
                    target.dataset.health = h;
                    target.style.opacity = Math.max(0.2, h / parseFloat(target.dataset.maxHealth));
                    if (h <= 0 && target.dataset.cleaning !== 'true') {
                        target.dataset.cleaning = 'true';
                        createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, target.style.backgroundColor);
                        setTimeout(() => target.remove(), 800);
                        updateScore(target.classList.contains('boss-stain') ? 10 : 1);
                    }
                }
                moveBot();
            }, randomDelay);
        } else {
            botEl.style.left = `${Math.random() * (window.innerWidth - 60)}px`;
            botEl.style.top = `${Math.random() * (window.innerHeight - 60)}px`;
            setTimeout(moveBot, 2000);
        }
    }
    moveBot();
}

const UPGRADE_POOL = [
    { title: "⚡ აჩქარება (Speed)", desc: "+10% სისწრაფე", prob: 0.02, action: () => intervalMultiplier *= 0.9 },
    { title: "🐢 ნელი სისწრაფე", desc: "+1% სისწრაფე", prob: 0.20, action: () => intervalMultiplier *= 0.99 },
    { title: "💨 სუპერ აჩქარება", desc: "+50% სისწრაფე", prob: 0.002, action: () => intervalMultiplier *= 0.5 },
    { title: "🤖 დამხმარე", desc: "+1 დამხმარე", prob: 0.01, action: () => { totalHelpersOwned++; activeHelpers++; startHelperBot(); saveStatsToLocal(); } },
    { title: "🤖🤖 დამხმარეები", desc: "+2 დამხმარე", prob: 0.005, action: () => { totalHelpersOwned += 2; activeHelpers += 2; startHelperBot(); startHelperBot(); saveStatsToLocal(); } },
    { title: "🤖🔥 დამხმარე რაზმი", desc: "+3 დამხმარე", prob: 0.0007, action: () => { totalHelpersOwned += 3; activeHelpers += 3; startHelperBot(); startHelperBot(); startHelperBot(); saveStatsToLocal(); } },
    { title: "📏 რადიუსი S", desc: "+10% რადიუსი", prob: 0.05, action: () => { radiusMultiplier *= 1.1; updatePowerStats(); } },
    { title: "📏 რადიუსი M", desc: "+20% რადიუსი", prob: 0.025, action: () => { radiusMultiplier *= 1.2; updatePowerStats(); } },
    { title: "📏 რადიუსი L", desc: "+30% რადიუსი", prob: 0.01, action: () => { radiusMultiplier *= 1.3; updatePowerStats(); } },
    { title: "💦 კერხერი", desc: "გაძლიერებული წმენდა", prob: 0.001, action: () => { hasKarcher = true; updatePowerStats(); } },
    { title: "🤖⚡ რობოტების სისწრაფე", desc: "+10% სიჩქარე", prob: 0.05, action: () => helperSpeedMultiplier *= 1.1 },
    { title: "🤖🔥🔥 რობოტების სისწრაფე", desc: "+20% სიჩქარე", prob: 0.025, action: () => helperSpeedMultiplier *= 1.2 },
    { title: "🤖🚀 რობოტების სისწრაფე", desc: "+30% სიჩქარე", prob: 0.01, action: () => helperSpeedMultiplier *= 1.3 },
    { title: "💪 ტილოს ძალა 10%", desc: "+10% ძალა", prob: 0.05, action: () => { strengthMultiplier *= 1.1; updatePowerStats(); } },
    { title: "💪💪 ტილოს ძალა 20%", desc: "+20% ძალა", prob: 0.025, action: () => { strengthMultiplier *= 1.2; updatePowerStats(); } },
];

function showUpgradeOptions() {
    const modal = get('upgrade-modal');
    if (!modal) return;
    const container = get('upgrade-cards-container');
    container.innerHTML = '';
    modal.classList.remove('hidden');

    for (let i = 0; i < 3; i++) {
        const card = weightedRandom(UPGRADE_POOL);
        const cardEl = document.createElement('div');
        cardEl.className = 'upgrade-card';
        cardEl.innerHTML = `<h3>${card.title}</h3><p>${card.desc}</p>`;
        cardEl.onclick = () => {
            card.action();
            modal.classList.add('hidden');
            updateUIValues();
        };
        container.appendChild(cardEl);
    }
}

function weightedRandom(items) {
    let totalProb = items.reduce((acc, item) => acc + item.prob, 0);
    let r = Math.random() * totalProb;
    let sum = 0;
    for (let item of items) {
        sum += item.prob;
        if (r <= sum) return item;
    }
    return items[0];
}

function handleSpin(spinner) {
    if (!hasSpinUpgrade) return;
    let spinSpeed = parseInt(spinner.dataset.spinSpeed || '0');
    spinSpeed += 5;
    spinner.dataset.spinSpeed = spinSpeed;

    spinner.classList.add('spinning');
    spinner.style.animationDuration = `${Math.max(0.1, 1 - (spinSpeed * 0.05))}s`;

    const rect = spinner.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = 150 + (spinSpeed * 10);

    const stains = document.querySelectorAll('.stain');
    stains.forEach(stain => {
        if (stain.dataset.cleaning === 'true') return;
        const sRect = stain.getBoundingClientRect();
        const sx = sRect.left + sRect.width / 2;
        const sy = sRect.top + sRect.height / 2;
        const dist = Math.sqrt(Math.pow(cx - sx, 2) + Math.pow(cy - sy, 2));

        if (dist < radius) {
            let h = parseFloat(stain.dataset.health);
            h -= (20 + spinSpeed * 2);
            stain.dataset.health = h;
            stain.style.opacity = Math.max(0.2, h / parseFloat(stain.dataset.maxHealth));
            if (h <= 0 && stain.dataset.cleaning !== 'true') {
                stain.dataset.cleaning = 'true';
                createParticles(sx, sy, stain.style.backgroundColor);
                setTimeout(() => stain.remove(), 800);
                updateScore(stain.classList.contains('boss-stain') ? 10 : 1);
            }
        }
    });

    setTimeout(() => {
        spinSpeed -= 2;
        spinner.dataset.spinSpeed = Math.max(0, spinSpeed);
        if (spinSpeed <= 0) spinner.classList.remove('spinning');
    }, 1000);
}

function checkCleaningAtPos(x, y) {
    const stains = document.querySelectorAll('.stain');
    stains.forEach(stain => {
        if (stain.dataset.cleaning === 'true') return;
        const rect = stain.getBoundingClientRect();
        if (x > rect.left && x < rect.right && y > rect.top && y < rect.bottom) {
            let h = parseFloat(stain.dataset.health);
            h -= clothStrength;
            stain.dataset.health = h;
            stain.style.opacity = Math.max(0.2, h / parseFloat(stain.dataset.maxHealth));
            if (h <= 0) {
                stain.dataset.cleaning = 'true';
                createParticles(x, y, stain.style.backgroundColor);
                setTimeout(() => stain.remove(), 800);
                updateScore(stain.classList.contains('boss-stain') ? 10 : 1);
            }
        }
    });
}

function createStain(isBoss = false) {
    if (!gameActive) return;
    const container = get('canvas-container');
    if (!container) return;
    const stain = document.createElement('div');
    stain.className = 'stain';
    if (isBoss) stain.classList.add('boss-stain');

    let health = isBoss ? 1500 : 100;
    const types = [
        { name: 'coffee', color: 'rgba(111, 78, 55, 0.4)', blur: '10px' },
        { name: 'ink', color: 'rgba(0, 0, 128, 0.3)', blur: '5px' },
        { name: 'grease', color: 'rgba(150, 150, 100, 0.2)', blur: '15px' }
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const size = isBoss ? 250 : (Math.random() * 80 + 40);
    const posX = Math.random() * (window.innerWidth - size);
    const posY = Math.random() * (window.innerHeight - size);

    stain.style.width = `${size}px`; stain.style.height = `${size}px`;
    stain.style.left = `${posX}px`; stain.style.top = `${posY}px`;
    stain.style.backgroundColor = isBoss ? 'rgba(255, 0, 0, 0.3)' : type.color;
    stain.style.filter = `blur(${isBoss ? '20px' : type.blur})`;
    stain.style.borderRadius = `${30 + Math.random() * 70}% ${30 + Math.random() * 70}% ${30 + Math.random() * 70}% ${30 + Math.random() * 70}%`;
    stain.dataset.health = health; stain.dataset.maxHealth = health;
    if (isBoss) stain.innerHTML = '<div class="boss-title">BOSS</div>';

    container.appendChild(stain);
    checkDefeatCondition();
}

function checkDefeatCondition() {
    const totalCount = document.querySelectorAll('.stain').length;
    if (totalCount >= 200) {
        if (!defeatTimer) {
            let timeLeft = 60;
            showStatusUpdate("გაფრთხილება: ძალიან ბევრი ჭუჭყია! ⚠️");
            defeatTimer = setInterval(() => {
                timeLeft--;
                if (timeLeft <= 0) {
                    clearInterval(defeatTimer);
                    handleGameOver();
                } else if (timeLeft % 5 === 0 || timeLeft < 10) {
                    showStatusUpdate(`კრიზისი! ${timeLeft}წ დარჩა გასაწმენდად! ⚠️`);
                }
            }, 1000);
        }
    } else {
        if (defeatTimer) {
            clearInterval(defeatTimer);
            defeatTimer = null;
            showStatusUpdate("კრიზისი თავიდან აცილებულია! ✅");
        }
    }
}

function handleGameOver() {
    gameActive = false;
    const finalScore = score;
    const finalTime = Math.floor((Date.now() - startTime) / 1000);

    lastPrevScore = { score: finalScore, time: finalTime };
    localStorage.setItem('tilo_prev_score', JSON.stringify(lastPrevScore));

    if (finalScore > lastBestScore.score) {
        lastBestScore = { score: finalScore, time: finalTime };
        localStorage.setItem('tilo_best_score', JSON.stringify(lastBestScore));
    }

    syncUserData();

    get('final-stains').textContent = finalScore;
    get('final-time').textContent = finalTime;
    get('defeat-modal').classList.remove('hidden');
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
            h -= clothStrength;
            stain.dataset.health = h;
            stain.style.opacity = Math.max(0.2, h / parseFloat(stain.dataset.maxHealth));
            if (h <= 0) {
                stain.dataset.cleaning = 'true';
                createParticles(sx, sy, stain.style.backgroundColor);
                setTimeout(() => stain.remove(), 800);
                updateScore(stain.classList.contains('boss-stain') ? 10 : 1);
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
        p.style.pointerEvents = 'none';
        container.appendChild(p);
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
    let base = 2000 * intervalMultiplier * (1 - (permSpeedLevel * 0.05));
    return Math.max(200, base - (score * 2));
}

function scheduleNextStain() {
    if (!gameActive) return;
    createStain();
    setTimeout(scheduleNextStain, getSpawnInterval());
}

function centerCloth() {
    const cloth = get('cloth');
    if (!cloth) return;
    const r = cloth.getBoundingClientRect();
    xOffset = window.innerWidth / 2 - r.width / 2;
    yOffset = window.innerHeight / 2 - r.height / 2;
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

// --- Initialization ---

window.addEventListener('load', async () => {
    await initDatabase();
    await checkForUpdates();

    score = 0;
    totalStainsCleaned = 0;
    startTime = Date.now();

    if (isVip) {
        if (get('cloth')) get('cloth').classList.add('vip-rainbow-trail');
        if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
        if (get('buy-vip-btn')) get('buy-vip-btn').style.display = 'none';
        if (get('cloth')) get('cloth').classList.add('vip-cloth');
    }

    if (userEmail) {
        try {
            await sql`UPDATE users SET score = 0 WHERE email = ${userEmail}`;
        } catch (e) { }
        get('auth-modal').classList.add('hidden');
    } else {
        get('auth-modal').classList.remove('hidden');
    }

    updatePowerStats();
    initUI();
    setupChat();
    centerCloth();
    updateUIValues();
    fetchLeaderboard();

    setInterval(() => {
        lbTimeLeft--;
        if (lbTimeLeft <= 0) {
            fetchLeaderboard();
            lbTimeLeft = 10;
        }
        if (get('lb-timer')) get('lb-timer').textContent = `(${lbTimeLeft}წ)`;
    }, 1000);

    setInterval(checkForUpdates, 30000);
    setInterval(() => { if (userEmail) syncUserData(); }, 15000);

    // Boss Spawner Every 1 Minute
    setInterval(() => {
        if (!gameActive) return;
        bossCount++;
        const bossSpawnCount = Math.floor(bossCount / 10) + 1;
        for (let i = 0; i < bossSpawnCount; i++) {
            createStain(true);
        }
    }, 60000);

    for (let i = 0; i < activeHelpers; i++) startHelperBot();
    scheduleNextStain();

    setInterval(checkCleaning, 200);

    get('cloth').onclick = (e) => {
        if (hasSpinUpgrade) {
            handleSpin(get('cloth'));
        }
    };
});

window.addEventListener("mousedown", dragStart);
window.addEventListener("mouseup", dragEnd);
window.addEventListener("mousemove", drag);
window.addEventListener("touchstart", dragStart);
window.addEventListener("touchend", dragEnd);
window.addEventListener("touchmove", drag);
window.addEventListener('resize', centerCloth);
