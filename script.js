// Safe element getter
const get = (id) => document.getElementById(id);

// Neon Database Config (Serverless Driver)
import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

// IMPORTANT: This is the connection string you provided.
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

// State & Version Control
const APP_VERSION = "2.2.0"; // Leaderboard reset update
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

// Helper Bot State (Roguelike only)
let activeHelpers = 0;
let helperSpeedMultiplier = 1.0;

// --- Skin System ---
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
    if (get('score-val')) get('score-val').textContent = Math.floor(score);

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

        checkWeeklyReset();

    } catch (e) { console.error("DB Init Error", e); }
}

async function checkWeeklyReset() {
    try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        // Reset happens Sunday 00:00 (Saturday 24:00)
        const day = now.getDay();
        const sundayTimestamp = new Date(now.setDate(now.getDate() - day)).getTime();

        const config = await sql`SELECT value FROM system_config WHERE key = 'last_lb_reset'`;
        const lastReset = config.length > 0 ? parseInt(config[0].value) : 0;

        if (lastReset < sundayTimestamp) {
            console.log("Weekly Leaderboard Reset Triggered...");
            // Only one client should succeed in updating the timestamp
            const result = await sql`INSERT INTO system_config (key, value) 
                                    VALUES ('last_lb_reset', ${sundayTimestamp})
                                    ON CONFLICT (key) DO UPDATE 
                                    SET value = ${sundayTimestamp} 
                                    WHERE system_config.value IS NULL OR CAST(system_config.value AS BIGINT) < ${sundayTimestamp}
                                    RETURNING *`;

            if (result.length > 0) {
                await sql`UPDATE users SET score = 0, survival_time = 0`;
                console.log("Database reset complete.");
            }
        }
    } catch (e) { console.error("Reset Check Error", e); }
}

async function checkForUpdates() {
    try {
        const result = await sql`SELECT value FROM system_config WHERE key = 'app_version'`;
        if (result.length > 0 && result[0].value !== APP_VERSION) {
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
async function syncUserData(force = false) {
    if (!userEmail) return;

    if (force) {
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
            return;
        } catch (e) { return; }
    }

    if (!gameActive) return;

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
        } catch (e) { }
    }, 1000);
}

async function fetchLeaderboard() {
    try {
        const result = await sql`
            SELECT nickname, score, survival_time, is_vip,
            CASE WHEN score > 0 THEN CAST(survival_time AS FLOAT) / score ELSE 999999 END as efficiency
            FROM users 
            WHERE score > 0
            ORDER BY efficiency ASC, score DESC 
            LIMIT 50
        `;
        onlinePlayers = result;
        updateLeaderboardUI();

        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '30 seconds'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;
    } catch (e) { }
}

function updateLeaderboardUI() {
    const combined = [...onlinePlayers].sort((a, b) => {
        let effA = a.score > 0 ? a.survival_time / a.score : 999999;
        let effB = b.score > 0 ? b.survival_time / b.score : 999999;
        if (effA !== effB) return effA - effB;
        return b.score - a.score;
    });
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
            const eff = entry.score > 0 ? (timeVal / entry.score).toFixed(2) : 'N/A';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="lb-rank">#${i + 1}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span>${entry.is_vip ? '👑 ' : ''}${entry.nickname}</span>
                        <span style="font-size: 0.7rem; opacity: 0.6;">${timeVal}წ / ${eff}წ ლაქაზე</span>
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

        if (score >= nextUpgradeScore) {
            showUpgradeOptions();
            nextUpgradeScore = Math.ceil(nextUpgradeScore * 1.3);
            syncUserData(true); // Force sync on upgrade
        }

        // Sync every 20 points for "immediate" reflection
        if (Math.floor(score) % 20 === 0) {
            syncUserData(true);
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

    get('register-btn').onclick = handleRegister;
    get('login-btn').onclick = handleLogin;
    get('logout-btn').onclick = () => {
        if (confirm("ნამდვილად გსურთ გასვლა?")) {
            localStorage.clear();
            location.reload();
        }
    };

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
    let isDraggingChat = false;
    let chatOffsetX, chatOffsetY;

    function onChatDrag(e) {
        if (!isDraggingChat) return;
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
        if (!text || !nickname) return;
        try {
            await sql`INSERT INTO chat_messages (nickname, message) VALUES (${nickname}, ${text})`;
            chatInput.value = '';
            fetchChat();
        } catch (e) { }
    }
    sendBtn.onclick = sendMsg;
    chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
    setInterval(fetchChat, 3000);
}

async function fetchChat() {
    try {
        const msgs = await sql`
            SELECT cm.*, u.is_vip 
            FROM chat_messages cm 
            LEFT JOIN users u ON LOWER(cm.nickname) = LOWER(u.nickname) 
            WHERE cm.created_at > NOW() - INTERVAL '30 seconds' 
            ORDER BY cm.created_at ASC
        `;
        const container = get('chat-messages');
        if (!container) return;
        container.innerHTML = '';
        msgs.forEach(m => {
            const el = document.createElement('div');
            el.className = 'chat-msg';

            const isVipUser = m.is_vip === true;
            const nameClass = isVipUser ? 'vip-rainbow-text chat-vip-name' : '';
            const crown = isVipUser ? '👑 ' : '';

            el.innerHTML = `<strong class="${nameClass}">${crown}${m.nickname}:</strong> ${m.message}`;
            container.appendChild(el);
            container.scrollTop = container.scrollHeight;
        });
    } catch (e) { }
}

function startHelperBot() {
    activeHelpers++;
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
            botEl.style.left = `${rect.left + (Math.random() - 0.5) * 30}px`;
            botEl.style.top = `${rect.top + (Math.random() - 0.5) * 30}px`;

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
            }, (1500 / helperSpeedMultiplier) + (Math.random() * 800));
        } else {
            botEl.style.left = `${Math.random() * (window.innerWidth - 60)}px`;
            botEl.style.top = `${Math.random() * (window.innerHeight - 60)}px`;
            setTimeout(moveBot, 2000);
        }
    }
    moveBot();
}

const UPGRADE_POOL = [
    { title: "⚡ ლაქების აჩქარება", desc: "+10% ლაქების სიხშირე", prob: 0.1, action: () => intervalMultiplier *= 0.9 },
    { title: "🤖 დამხმარის სიჩქარე", desc: "+20% რობოტების სისწრაფე", prob: 0.15, action: () => helperSpeedMultiplier *= 1.2 },
    { title: "🤖 რობოტი", desc: "+1 დამხმარე რობოტი", prob: 0.05, action: () => startHelperBot() },
    { title: "📏 რადიუსი S", desc: "+10% წმენდის რადიუსი", prob: 0.2, action: () => { radiusMultiplier *= 1.1; updatePowerStats(); } },
    { title: "💪 ტილოს ძალა", desc: "+15% წმენდის ძალა", prob: 0.2, action: () => { strengthMultiplier *= 1.15; updatePowerStats(); } },
];

function showUpgradeOptions() {
    const modal = get('upgrade-modal');
    const container = get('upgrade-cards-container');
    if (!modal || !container) return;
    container.innerHTML = '';
    modal.classList.remove('hidden');

    let selectedCards = [];
    let attempts = 0;
    while (selectedCards.length < 3 && attempts < 50) {
        const card = weightedRandom(UPGRADE_POOL);
        if (!selectedCards.some(c => c.title === card.title)) {
            selectedCards.push(card);
        }
        attempts++;
    }

    selectedCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'upgrade-card';
        cardEl.innerHTML = `<h3>${card.title}</h3><p>${card.desc}</p>`;
        cardEl.onclick = () => { card.action(); modal.classList.add('hidden'); updateUIValues(); };
        container.appendChild(cardEl);
    });
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

function createStain(isBoss = false) {
    if (!gameActive) return;
    const container = get('canvas-container');
    if (!container) return;
    const stain = document.createElement('div');
    stain.className = 'stain';
    if (isBoss) stain.classList.add('boss-stain');

    let health = isBoss ? 1500 : 100;
    const size = isBoss ? 250 : (Math.random() * 80 + 40);
    stain.style.width = `${size}px`; stain.style.height = `${size}px`;
    stain.style.left = `${Math.random() * (window.innerWidth - size)}px`;
    stain.style.top = `${Math.random() * (window.innerHeight - size)}px`;
    stain.style.backgroundColor = isBoss ? 'rgba(255, 0, 0, 0.3)' : 'rgba(111, 78, 55, 0.4)';
    stain.dataset.health = health; stain.dataset.maxHealth = health;
    if (isBoss) stain.innerHTML = '<div class="boss-title">BOSS</div>';
    container.appendChild(stain);
    checkDefeatCondition();
}

function checkDefeatCondition() {
    const totalCount = document.querySelectorAll('.stain').length;
    if (totalCount >= 200 && !defeatTimer) {
        let timeLeft = 60;
        defeatTimer = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) { clearInterval(defeatTimer); handleGameOver(); }
            else if (timeLeft % 5 === 0) showStatusUpdate(`კრიზისი! ${timeLeft}წ დარჩა! ⚠️`);
        }, 1000);
    } else if (totalCount < 200 && defeatTimer) {
        clearInterval(defeatTimer); defeatTimer = null; showStatusUpdate("კრიზისი დაძლეულია! ✅");
    }
}

async function handleGameOver() {
    gameActive = false;
    const finalScore = score;
    const finalTime = Math.floor((Date.now() - startTime) / 1000);
    lastPrevScore = { score: finalScore, time: finalTime };
    localStorage.setItem('tilo_prev_score', JSON.stringify(lastPrevScore));
    if (finalScore > lastBestScore.score) {
        lastBestScore = { score: finalScore, time: finalTime };
        localStorage.setItem('tilo_best_score', JSON.stringify(lastBestScore));
    }

    // Force final sync and refresh LB
    await syncUserData(true);
    fetchLeaderboard();

    get('final-stains').textContent = Math.floor(finalScore);
    get('final-time').textContent = finalTime;
    get('defeat-modal').classList.remove('hidden');
}

function checkCleaning() {
    const cloth = get('cloth');
    if (!cloth) return;
    const rect = cloth.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = (rect.width / 2) * cleaningRadius;
    document.querySelectorAll('.stain').forEach(stain => {
        if (stain.dataset.cleaning === 'true') return;
        const sRect = stain.getBoundingClientRect();
        const sx = sRect.left + sRect.width / 2;
        const sy = sRect.top + sRect.height / 2;
        if (Math.sqrt(Math.pow(cx - sx, 2) + Math.pow(cy - sy, 2)) < radius + sRect.width / 2) {
            let h = parseFloat(stain.dataset.health) - clothStrength;
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
    for (let i = 0; i < 4; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute'; p.style.left = `${x}px`; p.style.top = `${y}px`;
        p.style.width = '6px'; p.style.height = '6px'; p.style.backgroundColor = color;
        p.style.borderRadius = '50%'; p.style.pointerEvents = 'none';
        container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const vel = Math.random() * 40;
        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(angle) * vel}px,${Math.sin(angle) * vel}px) scale(0)`, opacity: 0 }
        ], { duration: 600 }).onfinish = () => p.remove();
    }
}

function getSpawnInterval() {
    return Math.max(200, (2000 * intervalMultiplier) - (score * 2));
}

function scheduleNextStain() {
    if (!gameActive) return;
    createStain();
    setTimeout(scheduleNextStain, getSpawnInterval());
}

function centerCloth() {
    const cloth = get('cloth');
    if (!cloth) return;
    xOffset = window.innerWidth / 2 - cloth.clientWidth / 2;
    yOffset = window.innerHeight / 2 - cloth.clientHeight / 2;
    cloth.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
}

function dragStart(e) {
    const cx = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    const cy = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;
    initialX = cx - xOffset; initialY = cy - yOffset;
    if (e.target === get('cloth') || get('cloth').contains(e.target)) isDragging = true;
}

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

window.addEventListener('load', async () => {
    await initDatabase();
    await checkForUpdates();
    score = 0; startTime = Date.now();
    if (isVip) {
        if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
        if (get('buy-vip-btn')) get('buy-vip-btn').style.display = 'none';
        if (get('cloth')) get('cloth').classList.add('vip-cloth');
    }
    if (userEmail) {
        try {
            const uData = await sql`SELECT score, survival_time FROM users WHERE email = ${userEmail}`;
            if (uData.length > 0) {
                score = uData[0].score;
                // Update survival time logic if needed
            }
        } catch (e) { }
        get('auth-modal').classList.add('hidden');
    } else get('auth-modal').classList.remove('hidden');

    updatePowerStats(); initUI(); setupChat(); centerCloth(); updateUIValues(); fetchLeaderboard();

    setInterval(() => {
        lbTimeLeft--;
        if (lbTimeLeft <= 0) { fetchLeaderboard(); lbTimeLeft = 10; }
        if (get('lb-timer')) get('lb-timer').textContent = `(${lbTimeLeft}წ)`;
    }, 1000);

    setInterval(checkForUpdates, 30000);
    setInterval(() => { if (userEmail) syncUserData(); }, 5000);

    setInterval(() => {
        if (gameActive) {
            bossCount++;
            const bossSpawnCount = Math.floor(score / 500) + 1;
            for (let i = 0; i < bossSpawnCount; i++) createStain(true);
        }
    }, 60000);

    scheduleNextStain();
    setInterval(checkCleaning, 200);
});

window.addEventListener("mousedown", dragStart); window.addEventListener("mouseup", () => isDragging = false); window.addEventListener("mousemove", drag);
window.addEventListener("touchstart", dragStart); window.addEventListener("touchend", () => isDragging = false); window.addEventListener("touchmove", drag);
window.addEventListener('resize', centerCloth);
