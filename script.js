// Safe element getter
const get = (id) => document.getElementById(id);

// Neon Database Config (Serverless Driver)
import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

// IMPORTANT: This is the connection string you provided.
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

// State & Version Control
const APP_VERSION = "2.1.0"; // Increment for new version
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

// --- Skin System (New) ---
let ownedSkins = JSON.parse(localStorage.getItem('tilo_owned_skins')) || [];
let currentSkin = localStorage.getItem('tilo_current_skin') || 'default';

// Scaling Multipliers (from cards)
let intervalMultiplier = 1.0;
let radiusMultiplier = 1.0;
let strengthMultiplier = 1.0;

// Base stats
let baseClothStrength = 20;
let clothStrength = 0;
let cleaningRadius = 1;

// --- Helper Functions ---

function updatePowerStats() {
    let power = baseClothStrength * strengthMultiplier;
    const clothEl = get('cloth');

    // Remove old effects logic (Karcher removed)
    cleaningRadius = 1 * radiusMultiplier;
    clothStrength = power;

    // Apply Current Skin
    if (clothEl) {
        clothEl.classList.remove('skin-fire', 'skin-ice', 'skin-jungle', 'skin-electric');
        if (currentSkin !== 'default') clothEl.classList.add(`skin-${currentSkin}`);
    }
}

function saveStatsToLocal() {
    localStorage.setItem('tilo_coins', coins);
    localStorage.setItem('tilo_vip', isVip);
    localStorage.setItem('tilo_owned_skins', JSON.stringify(ownedSkins));
    localStorage.setItem('tilo_current_skin', currentSkin);
}

function updateUIValues() {
    if (get('coins-val')) get('coins-val').textContent = coins;
    if (get('score-val')) get('score-val').textContent = score;

    // Stats UI
    if (get('best-score-stat')) get('best-score-stat').textContent = `${lastBestScore.score} stain / ${lastBestScore.time}s`;
    if (get('prev-score-stat')) get('prev-score-stat').textContent = `${lastPrevScore.score} stain / ${lastPrevScore.time}s`;

    const updateSkinBtn = (id, skinName) => {
        const btn = get(id);
        if (!btn) return;
        if (ownedSkins.includes(skinName)) {
            if (currentSkin === skinName) {
                btn.textContent = "არჩეულია";
                btn.disabled = true;
                btn.style.opacity = "0.5";
            } else {
                btn.textContent = "არჩევა";
                btn.disabled = false;
                btn.style.opacity = "1";
            }
        } else {
            btn.textContent = `50 🪙`;
            btn.disabled = coins < 50;
            btn.style.opacity = coins < 50 ? "0.5" : "1";
        }
    };

    updateSkinBtn('buy-skin-fire', 'fire');
    updateSkinBtn('buy-skin-ice', 'ice');
    updateSkinBtn('buy-skin-jungle', 'jungle');
    updateSkinBtn('buy-skin-electric', 'electric');

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
            owned_skins TEXT DEFAULT '[]',
            current_skin TEXT DEFAULT 'default',
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // Reset Table/Stats for current migration if needed (Manual strip)
        // User asked to strip everyone, so we'll ignore old helper/strength columns
        try {
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_skins TEXT DEFAULT '[]'`;
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS current_skin TEXT DEFAULT 'default'`;
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
        await sql`INSERT INTO users (email, password, nickname, coins, is_vip, owned_skins, current_skin) 
                  VALUES (${email}, ${pass}, ${nick}, ${coins}, ${isVip}, ${JSON.stringify(ownedSkins)}, ${currentSkin})`;

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
            ownedSkins = JSON.parse(user.owned_skins || '[]');
            currentSkin = user.current_skin || 'default';

            localStorage.setItem('tilo_nick', nickname);
            localStorage.setItem('tilo_email', userEmail);
            localStorage.setItem('tilo_coins', coins);
            localStorage.setItem('tilo_vip', isVip);
            localStorage.setItem('tilo_owned_skins', JSON.stringify(ownedSkins));
            localStorage.setItem('tilo_current_skin', currentSkin);

            // Strip old stats from local storage for everyone on login too
            localStorage.removeItem('tilo_total_helpers');
            localStorage.removeItem('tilo_active_helpers');
            localStorage.removeItem('tilo_has_spin');
            localStorage.removeItem('tilo_has_karcher');
            localStorage.removeItem('tilo_strength_lvl');
            localStorage.removeItem('tilo_speed_lvl');

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
                owned_skins = ${JSON.stringify(ownedSkins)},
                current_skin = ${currentSkin},
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

function handleSkinAction(name) {
    if (ownedSkins.includes(name)) {
        currentSkin = name;
        showStatusUpdate(`${name} სკინი არჩეულია! ✨`);
    } else {
        if (coins >= 50) {
            coins -= 50;
            ownedSkins.push(name);
            currentSkin = name;
            showStatusUpdate(`${name} სკინი შეძენილია! 🔥`);
        }
    }
    updatePowerStats();
    saveStatsToLocal();
    updateUIValues();
    syncUserData();
}

function initUI() {
    get('buy-skin-fire').onclick = () => handleSkinAction('fire');
    get('buy-skin-ice').onclick = () => handleSkinAction('ice');
    get('buy-skin-jungle').onclick = () => handleSkinAction('jungle');
    get('buy-skin-electric').onclick = () => handleSkinAction('electric');

    get('shop-btn').onclick = () => get('shop-modal').classList.remove('hidden');
    get('close-shop').onclick = () => get('shop-modal').classList.add('hidden');
    get('settings-btn').onclick = () => get('settings-modal').classList.remove('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('restart-game-btn').onclick = () => {
        location.reload();
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

const UPGRADE_POOL = [
    { title: "⚡ აჩქარება (Speed)", desc: "+10% სისწრაფე", prob: 0.1, action: () => intervalMultiplier *= 0.9 },
    { title: "🐢 ნელი სისწრაფე", desc: "+1% სისწრაფე", prob: 0.30, action: () => intervalMultiplier *= 0.99 },
    { title: "📏 რადიუსი S", desc: "+10% რადიუსი", prob: 0.2, action: () => { radiusMultiplier *= 1.1; updatePowerStats(); } },
    { title: "📏 რადიუსი M", desc: "+20% რადიუსი", prob: 0.1, action: () => { radiusMultiplier *= 1.2; updatePowerStats(); } },
    { title: "💪 ტილოს ძალა 10%", desc: "+10% ძალა", prob: 0.2, action: () => { strengthMultiplier *= 1.1; updatePowerStats(); } },
    { title: "💪💪 ტილოს ძალა 20%", desc: "+20% ძალა", prob: 0.1, action: () => { strengthMultiplier *= 1.2; updatePowerStats(); } },
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
                updateScore(stain.classList.contains('boss-stain') ? 10 : 1);
                setTimeout(() => stain.remove(), 800);
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
                updateScore(stain.classList.contains('boss-stain') ? 10 : 1);
                setTimeout(() => stain.remove(), 800);
            }
        }
    });
}

function createParticles(x, y, color) {
    const container = get('canvas-container');
    const count = 4;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute'; p.style.left = `${x}px`; p.style.top = `${y}px`;
        p.style.width = '6px'; p.style.height = '6px'; p.style.backgroundColor = color;
        p.style.borderRadius = '50%';
        p.style.pointerEvents = 'none';
        container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 40;
        const tx = Math.cos(angle) * velocity; const ty = Math.sin(angle) * velocity;
        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px,${ty}px) scale(0)`, opacity: 0 }
        ], { duration: 600 }).onfinish = () => p.remove();
    }
}

function getSpawnInterval() {
    let base = 2000 * intervalMultiplier;
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
        if (cloth) cloth.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        checkCleaning();
    }
}

// --- Initialization ---

window.addEventListener('load', async () => {
    // Strip old stats completely on load (წაართვი ყველას)
    localStorage.removeItem('tilo_total_helpers');
    localStorage.removeItem('tilo_active_helpers');
    localStorage.removeItem('tilo_has_spin');
    localStorage.removeItem('tilo_has_karcher');
    localStorage.removeItem('tilo_strength_lvl');
    localStorage.removeItem('tilo_speed_lvl');

    await initDatabase();
    await checkForUpdates();

    score = 0;
    totalStainsCleaned = 0;
    startTime = Date.now();

    if (isVip) {
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

    scheduleNextStain();
    setInterval(checkCleaning, 200);
});

window.addEventListener("mousedown", dragStart);
window.addEventListener("mouseup", dragEnd);
window.addEventListener("mousemove", drag);
window.addEventListener("touchstart", dragStart);
window.addEventListener("touchend", dragEnd);
window.addEventListener("touchmove", drag);
window.addEventListener('resize', centerCloth);
