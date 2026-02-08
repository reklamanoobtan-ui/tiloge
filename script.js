// Safe element getter
const get = (id) => document.getElementById(id);

// Neon Database Config (Serverless Driver)
import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

// IMPORTANT: This is the connection string you provided.
const sql = neon("postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require");

// State & Version Control
const APP_VERSION = "2.2.1"; // Leaderboard Efficiency Update
let isDragging = false;
let currentX, currentY, initialX, initialY;
let xOffset = 0, yOffset = 0;
let score = 0;

let nickname = localStorage.getItem('tilo_nick') || '';
let userEmail = localStorage.getItem('tilo_email') || '';
let coins = parseInt(localStorage.getItem('tilo_coins')) || 0;
if (isNaN(coins)) coins = 0;

let isVip = localStorage.getItem('tilo_vip') === 'true';
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
let isUpgradeOpen = false;
let lastActivityTime = Date.now();

// Upgrade tracking
let upgradeCounts = {
    speed: 0,
    helperSpeed: 0,
    helperSpawn: 0,
    radius: 0,
    strength: 0,
    karcher: 0
};

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
            nickname TEXT,
            score INTEGER DEFAULT 0,
            survival_time INTEGER DEFAULT 0,
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`;

        // Drop UNIQUE constraint on nickname if it exists (for existing databases)
        try {
            await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_nickname_key`;
        } catch (e) { /* Constraint might not exist */ }

        await sql`CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            nickname TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;
    } catch (e) { console.error("DB Init Error", e); }
}

async function syncUserData() {
    if (!userEmail) return;
    try {
        const currentSurvival = Math.floor((Date.now() - startTime) / 1000);
        // Live Update: Overwrite stats with current session values
        await sql`UPDATE users SET 
            score = ${Math.floor(score)},
            survival_time = ${currentSurvival},
            last_seen = NOW()
            WHERE email = ${userEmail}`;
    } catch (e) { }
}

async function fetchLeaderboard() {
    const list = get('mini-lb-list');
    try {
        // Fetch Top 10 Players by Score (Slither.io style)
        const result = await sql`
            SELECT nickname, score, is_vip
            FROM users 
            WHERE last_seen > NOW() - INTERVAL '5 minutes'
            AND score > 0
            ORDER BY score DESC
            LIMIT 10
        `;

        if (list) {
            list.innerHTML = '';
            if (result.length === 0) {
                list.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:0.8rem;">No active players</p>';
            } else {
                result.forEach((user, index) => {
                    const div = document.createElement('div');
                    div.className = 'mini-lb-item';

                    if (user.nickname === nickname) div.style.background = "rgba(255, 215, 0, 0.2)";

                    const safeNick = user.nickname.substring(0, 12);
                    const crown = user.is_vip ? '👑 ' : '';
                    const nameColor = user.is_vip ? 'color: #ffd700; font-weight: 800;' : '';

                    div.innerHTML = `
                        <div class="mini-lb-info">
                            <span class="mini-lb-name" style="${nameColor}">${index + 1}. ${crown}${safeNick}</span>
                        </div>
                        <span class="mini-lb-score">${user.score} ✨</span>
                    `;
                    list.appendChild(div);
                });
            }
        }

        // Update Online Count
        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '2 minutes'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;

    } catch (e) {
        console.error("LB Error", e);
        if (list) list.innerHTML = '<p style="text-align: center; color: #ff4d4d; font-size: 0.7rem;">Connection Error</p>';
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

    // UI Toggle Logic
    get('ui-toggle-btn').onclick = () => get('ui-modal').classList.remove('hidden');
    get('close-ui').onclick = () => get('ui-modal').classList.add('hidden');

    const loadUIState = () => {
        const uiState = JSON.parse(localStorage.getItem('tilo_ui_state')) || { stats: true, lb: true, chat: true };
        get('toggle-stats').checked = uiState.stats;
        get('toggle-lb').checked = uiState.lb;
        get('toggle-chat').checked = uiState.chat;

        const statsEl = document.querySelector('.user-stats');
        if (statsEl) statsEl.style.display = uiState.stats ? 'flex' : 'none';

        const lb = get('mini-leaderboard');
        if (lb) lb.style.display = uiState.lb ? 'block' : 'none';

        const chat = get('global-chat');
        if (chat) chat.style.display = uiState.chat ? 'flex' : 'none';
    };

    get('toggle-stats').onchange = (e) => {
        const show = e.target.checked;
        const statsEl = document.querySelector('.user-stats');
        if (statsEl) statsEl.style.display = show ? 'flex' : 'none';
        saveUIState();
    };

    get('toggle-lb').onchange = (e) => {
        const show = e.target.checked;
        const lb = get('mini-leaderboard');
        if (lb) lb.style.display = show ? 'block' : 'none';
        saveUIState();
    };

    get('toggle-chat').onchange = (e) => {
        const show = e.target.checked;
        const chat = get('global-chat');
        if (chat) chat.style.display = show ? 'flex' : 'none';
        saveUIState();
    };

    const saveUIState = () => {
        const state = {
            stats: get('toggle-stats').checked,
            lb: get('toggle-lb').checked,
            chat: get('toggle-chat').checked
        };
        localStorage.setItem('tilo_ui_state', JSON.stringify(state));
    };

    loadUIState();

    get('shop-btn').onclick = () => get('shop-modal').classList.remove('hidden');
    get('close-shop').onclick = () => get('shop-modal').classList.add('hidden');
    get('settings-btn').onclick = () => get('settings-modal').classList.remove('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('restart-game-btn').onclick = () => {
        location.reload();
    };

    /* Donation logic removed */

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

    setupAdmin();
}

function setupAdmin() {
    const adminBtn = document.getElementById('admin-panel-btn');
    const adminModal = document.getElementById('admin-modal');
    if (!adminBtn || !adminModal) return;

    if (nickname === 'unoobi') {
        adminBtn.classList.remove('hidden');
    }

    adminBtn.onclick = () => adminModal.classList.remove('hidden');
    document.getElementById('close-admin').onclick = () => adminModal.classList.add('hidden');

    const statusMsg = document.getElementById('admin-status');
    const setStatus = (msg, color = 'green') => {
        if (statusMsg) {
            statusMsg.textContent = msg;
            statusMsg.style.color = color;
            setTimeout(() => statusMsg.textContent = '', 3000);
        }
    };

    const getVal = (id) => document.getElementById(id).value.trim();

    document.getElementById('admin-give-coins').onclick = async () => {
        const nick = getVal('admin-target-nick');
        if (!nick) return;
        try {
            await sql`UPDATE users SET coins = coins + 1000 WHERE nickname = ${nick} `;
            setStatus(`1000 Coins sent to ${nick} `);
        } catch (e) { setStatus('Error', 'red'); }
    };

    document.getElementById('admin-give-vip').onclick = async () => {
        const nick = getVal('admin-target-nick');
        if (!nick) return;
        try {
            await sql`UPDATE users SET is_vip = true WHERE nickname = ${nick} `;
            setStatus(`VIP granted to ${nick} `);
        } catch (e) { setStatus('Error', 'red'); }
    };

    document.getElementById('admin-ban-user').onclick = async () => {
        const nick = getVal('admin-target-nick');
        if (!nick) return;
        if (confirm(`Ban ${nick}? This will reset their stats.`)) {
            try {
                await sql`UPDATE users SET score = 0, survival_time = 0, coins = 0, is_vip = false, best_score = 0 WHERE nickname = ${nick} `;
                setStatus(`${nick} has been reset / banned`, 'red');
            } catch (e) { setStatus('Error', 'red'); }
        }
    };

    document.getElementById('admin-reset-lb').onclick = async () => {
        if (confirm("Reset Leaderboard for everyone?")) {
            try {
                await sql`UPDATE users SET score = 0, survival_time = 0`;
                setStatus("Leaderboard reset successful");
                fetchLeaderboard();
            } catch (e) { setStatus('Error', 'red'); }
        }
    };

    document.getElementById('admin-send-broadcast').onclick = async () => {
        const msg = getVal('admin-broadcast-msg');
        if (!msg) return;
        try {
            await sql`INSERT INTO chat_messages(nickname, message) VALUES('📢 SYSTEM', ${msg})`;
            document.getElementById('admin-broadcast-msg').value = '';
            setStatus("Broadcast sent");
        } catch (e) { setStatus('Error', 'red'); }
    };

    document.getElementById('admin-save-config').onclick = async () => {
        const speed = document.getElementById('admin-global-speed').value;
        try {
            // Need table for this, assume it exists or fail gracefully
            await sql`INSERT INTO system_config(key, value) VALUES('global_speed', ${speed})
                      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`;
            setStatus(`Global speed saved: ${speed} `);
        } catch (e) { setStatus('Error saving config', 'red'); }
    };
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
        chatContainer.style.left = `${x} px`;
        chatContainer.style.top = `${y} px`;
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
            await sql`INSERT INTO chat_messages(nickname, message) VALUES(${nickname}, ${text})`;
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

            el.innerHTML = `< strong class="${nameClass}" > ${crown}${m.nickname}:</strong > ${m.message} `;
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
            botEl.style.left = `${rect.left + (Math.random() - 0.5) * 30} px`;
            botEl.style.top = `${rect.top + (Math.random() - 0.5) * 30} px`;

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
            botEl.style.left = `${Math.random() * (window.innerWidth - 60)} px`;
            botEl.style.top = `${Math.random() * (window.innerHeight - 60)} px`;
            setTimeout(moveBot, 2000);
        }
    }
    moveBot();
}

const UPGRADE_POOL = [
    { id: 'speed', title: "⚡ პროგრესი", desc: "+10% სირთულე", prob: 0.15, action: () => { intervalMultiplier *= 0.9; upgradeCounts.speed++; } },
    { id: 'helperSpeed', title: "🤖 დამხმარის სიჩქარე", desc: "+30% რობოტების სისწრაფე", prob: 0.15, action: () => { helperSpeedMultiplier *= 1.3; upgradeCounts.helperSpeed++; } },
    { id: 'helperSpawn', title: "🤖 რობოტი", desc: "+1 დამხმარე რობოტი", prob: 0.05, action: () => { startHelperBot(); upgradeCounts.helperSpawn++; } },
    { id: 'radius', title: "📏 რადიუსი S", desc: "+30% წმენდის რადიუსი", prob: 0.2, action: () => { radiusMultiplier *= 1.3; upgradeCounts.radius++; updatePowerStats(); } },
    { id: 'strength', title: "💪 ტილოს ძალა", desc: "+30% წმენდის ძალა", prob: 0.2, action: () => { strengthMultiplier *= 1.3; upgradeCounts.strength++; updatePowerStats(); } },
    { id: 'karcher', title: "🚿 კერხერი", desc: "ორმაგი სიმძლავრე და რადიუსი", prob: 0.03, action: () => { strengthMultiplier *= 2; radiusMultiplier *= 2; upgradeCounts.karcher++; updatePowerStats(); } },
];

function showUpgradeOptions() {
    const modal = get('upgrade-modal');
    const container = get('upgrade-cards-container');
    if (!modal || !container) return;

    isUpgradeOpen = true;
    container.innerHTML = '';
    modal.classList.remove('hidden');

    let availableUpgrades = UPGRADE_POOL.filter(u => {
        if (u.id === 'karcher') return upgradeCounts.karcher < 1;
        if (u.id === 'helperSpawn') return upgradeCounts.helperSpawn < 10;
        if (u.id === 'strength') return strengthMultiplier < 3.0;
        if (u.id === 'radius') return radiusMultiplier < 3.0;
        if (u.id === 'helperSpeed') return helperSpeedMultiplier < 3.0;
        if (u.id === 'speed') return intervalMultiplier > 0.01;
        return true;
    });

    if (availableUpgrades.length === 0) {
        modal.classList.add('hidden');
        isUpgradeOpen = false;
        triggerEndgame();
        return;
    }

    let selectedCards = [];
    let attempts = 0;
    while (selectedCards.length < Math.min(3, availableUpgrades.length) && attempts < 50) {
        const card = weightedRandom(availableUpgrades);
        if (!selectedCards.some(c => c.id === card.id)) {
            selectedCards.push(card);
        }
        attempts++;
    }

    selectedCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'upgrade-card';
        cardEl.innerHTML = `<h3>${card.title}</h3><p>${card.desc}</p>`;
        cardEl.onclick = () => {
            card.action();
            modal.classList.add('hidden');
            isUpgradeOpen = false;
            updateUIValues();
            scheduleNextStain(); // Resume spawn loop
        };
        container.appendChild(cardEl);
    });
}
let bossScalingInterval;
let bossHealthMultiplier = 1;

function triggerEndgame() {
    showStatusUpdate("ყველა გაძლიერება ამოიწურა! ბოსების შემოსევა! 🚨");

    // Convert existing stains to bosses immediately
    document.querySelectorAll('.stain:not(.boss-stain)').forEach(stain => {
        stain.classList.add('boss-stain');
        stain.dataset.health = 1500 * bossHealthMultiplier;
        stain.dataset.maxHealth = 1500 * bossHealthMultiplier;
        stain.innerHTML = '<div class="boss-title">BOSS</div>';
        stain.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        stain.style.width = '250px';
        stain.style.height = '250px';
    });

    // Start escalation timer: Every 60s, double stats
    if (bossScalingInterval) clearInterval(bossScalingInterval);
    bossScalingInterval = setInterval(() => {
        if (!gameActive) { clearInterval(bossScalingInterval); return; }

        bossHealthMultiplier *= 2;
        showStatusUpdate(`ბოსები გაძლიერდნენ!(x${bossHealthMultiplier}) ☠️`);

        // Upgrade existing bosses
        document.querySelectorAll('.boss-stain').forEach(boss => {
            let currentMax = parseFloat(boss.dataset.maxHealth);
            let currentHealth = parseFloat(boss.dataset.health);

            // Scale up proportionally
            let newMax = currentMax * 2;
            let newHealth = currentHealth * 2;

            boss.dataset.maxHealth = newMax;
            boss.dataset.health = newHealth;

            // Visual growth
            let curSize = parseFloat(boss.style.width);
            let newSize = curSize * 1.2;
            boss.style.width = `${newSize}px`;
            boss.style.height = `${newSize}px`;
        });

    }, 60000);
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


function createParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.backgroundColor = color;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.setProperty('--tx', `${(Math.random() - 0.5) * 200}px`);
        p.style.setProperty('--ty', `${(Math.random() - 0.5) * 200}px`);
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
    }
}

function getSpawnInterval() {
    // Progressive difficulty - starts at 2000ms, gets faster with score
    return Math.max(10, (2000 * intervalMultiplier) - (score * 5));
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
    stain.style.width = `${size}px`;
    stain.style.height = `${size}px`;
    stain.style.left = `${Math.random() * (window.innerWidth - size)}px`;
    stain.style.top = `${Math.random() * (window.innerHeight - size)}px`;
    stain.style.backgroundColor = isBoss ? 'rgba(255, 0, 0, 0.3)' : 'rgba(111, 78, 55, 0.4)';
    stain.dataset.health = health;
    stain.dataset.maxHealth = health;

    if (isBoss) {
        stain.innerHTML = '<div class="boss-title">BOSS</div>';
        bossCount++;
    }

    container.appendChild(stain);
    checkDefeatCondition();
}

function checkDefeatCondition() {
    if (!gameActive) return;
    const totalCount = document.querySelectorAll('.stain').length;
    const bossCountUI = document.querySelectorAll('.boss-stain').length;
    const inactiveTime = (Date.now() - lastActivityTime) / 1000;

    const isCrisis = totalCount >= 300 || inactiveTime > 30 || bossCountUI >= 20;

    if (isCrisis && !defeatTimer) {
        let timeLeft = 60;
        defeatTimer = setInterval(() => {
            if (!gameActive) { clearInterval(defeatTimer); defeatTimer = null; return; }
            timeLeft--;
            if (timeLeft <= 0) { clearInterval(defeatTimer); gameOver(); }
            else if (timeLeft % 5 === 0) {
                let reason = "ჭუჭყი ბევრია!";
                if (inactiveTime > 30) reason = "არააქტიური ხარ!";
                else if (bossCountUI >= 20) reason = "ბოსების შემოსევა!";
                showStatusUpdate(`კრიზისი! ${reason} ${timeLeft}წ დარჩა! ⚠️`);
            }
        }, 1000);
    } else if (!isCrisis && defeatTimer) {
        clearInterval(defeatTimer);
        defeatTimer = null;
        showStatusUpdate("კრიზისი დაძლეულია! ✅");
    }
}


function gameOver() {
    gameActive = false;
    clearTimeout(spawnTimeout);
    if (bossScalingInterval) clearInterval(bossScalingInterval);

    // Survival calc
    let survival = Math.floor((Date.now() - startTime) / 1000);

    get('defeat-modal').classList.remove('hidden');
    get('final-stains').textContent = Math.floor(score);
    if (get('final-time')) get('final-time').textContent = survival;

    // Survival bonus
    coins += Math.floor(score * 0.5) + Math.floor(survival * 0.2);


    // Check Best Score (Local)
    if (score > lastBestScore.score) {
        lastBestScore.score = Math.floor(score);
        lastBestScore.time = survival;
        localStorage.setItem('tilo_best_score', JSON.stringify(lastBestScore));
    }

    // Save Last Score as "Prev Score"
    lastPrevScore.score = Math.floor(score);
    lastPrevScore.time = survival;
    localStorage.setItem('tilo_prev_score', JSON.stringify(lastPrevScore));

    saveStatsToLocal();
    syncUserData(true); // Final sync
}

// User Interaction (Mouse/Touch)
document.addEventListener('mousemove', (e) => {
    if (!gameActive) return;
    currentX = e.clientX;
    currentY = e.clientY;
    moveCloth(currentX, currentY);
});

document.addEventListener('touchmove', (e) => {
    if (!gameActive) return;
    e.preventDefault();
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    moveCloth(currentX, currentY);
}, { passive: false });

// Auto-cleaning loop - continuously clean nearby stains
setInterval(() => {
    if (!gameActive) return;
    if (currentX && currentY) {
        checkCleaning(currentX, currentY);
        lastActivityTime = Date.now(); // Track activity for crisis detection
    }
}, 50); // Check every 50ms for smooth auto-cleaning



function moveCloth(x, y) {
    const cloth = get('cloth');
    if (cloth) {
        // Center cursor in the middle of cloth
        const offsetX = cloth.offsetWidth / 2;
        const offsetY = cloth.offsetHeight / 2;
        cloth.style.left = `${x - offsetX}px`;
        cloth.style.top = `${y - offsetY}px`;
    }
}

function checkCleaning(bx, by) {
    const stains = document.querySelectorAll('.stain');
    stains.forEach(stain => {
        const rect = stain.getBoundingClientRect();
        const sx = rect.left + rect.width / 2;
        const sy = rect.top + rect.height / 2;
        const dist = Math.hypot(bx - sx, by - sy);

        // Radius check (base radius is roughly 50px visual, but we use logic)
        const hitRadius = (50 * cleaningRadius) + (rect.width / 2);

        if (dist < hitRadius) {
            let h = parseFloat(stain.dataset.health);
            // Damage calculation
            let effectiveDmg = clothStrength;

            // Type bonus logic (simple random crit for now or based on color later)
            if (stain.classList.contains('boss-stain')) {
                effectiveDmg *= 0.8; // Boss resistance
            }

            h -= effectiveDmg;
            stain.dataset.health = h;

            // Visual fade
            const maxH = parseFloat(stain.dataset.maxHealth);
            stain.style.opacity = Math.max(0.2, h / maxH);

            if (h <= 0 && stain.dataset.cleaning !== 'true') {
                stain.dataset.cleaning = 'true';
                createParticles(sx, sy, stain.style.backgroundColor);

                // Score depends on size/type
                let pts = stain.classList.contains('boss-stain') ? 50 : 1;
                updateScore(pts);

                setTimeout(() => stain.remove(), 100);
            }
        }
    });
}

// Init
window.onload = async () => {
    initUI();
    await initDatabase();

    // Slither.io Style Start
    // Hide UI initially
    document.querySelectorAll('.hidden-game-ui').forEach(el => el.classList.add('hidden'));

    // Setup Play Button
    // Setup Play Button
    get('play-game-btn').onclick = async () => {
        const inputNick = get('player-nick').value.trim();
        if (!inputNick) {
            alert("შეიყვანეთ ნიკნეიმი!");
            return;
        }

        nickname = inputNick;
        // Generate temp email/pass for session
        const sessionID = Date.now();
        userEmail = `guest_${sessionID}@tilo.ge`;
        const sessionPass = `pass_${sessionID}`;

        // Create temp user in DB
        try {
            await sql`INSERT INTO users(email, password, nickname, coins) VALUES(${userEmail}, ${sessionPass}, ${nickname}, 0)`;
            startGameSession();
        } catch (e) {
            console.error("Login Error", e);
            alert("შეცდომა! თავიდან სცადეთ.");
        }
    };

    setupChat(); // Initialize chat polling
};

function startGameSession() {
    isVip = false; // Reset VIP status for new session logic (or keep if desired)
    ownedSkins = [];
    currentSkin = 'default';
    coins = 0;
    score = 0;

    // Reset Upgrades
    intervalMultiplier = 1.0;
    radiusMultiplier = 1.0;
    strengthMultiplier = 1.0;
    updatePowerStats();

    // Apply UI
    get('game-start-overlay').classList.add('hidden');
    document.querySelectorAll('.hidden-game-ui').forEach(el => {
        el.classList.remove('hidden-game-ui');
        // If we applied 'hidden' class manually in onload:
        el.classList.remove('hidden');
    });

    // Start Loops
    gameActive = true;
    startTime = Date.now();
    lastActivityTime = Date.now(); // Initialize activity tracking
    scheduleNextStain();

    // Boss spawning interval (every 60 seconds)
    setInterval(() => {
        if (gameActive) {
            const bossSpawnCount = Math.floor(score / 500) + 1;
            for (let i = 0; i < bossSpawnCount; i++) {
                createStain(true); // Spawn boss
            }
        }
    }, 60000);

    // Defeat condition check
    setInterval(checkDefeatCondition, 1000);

    // Sync loop
    setInterval(() => { if (userEmail && gameActive) syncUserData(); }, 3000);
    // Leaderboard loop
    fetchLeaderboard();
    setInterval(fetchLeaderboard, 5000);
}

let spawnTimeout;
function scheduleNextStain() {
    if (isUpgradeOpen || !gameActive) return;
    createStain();
    spawnTimeout = setTimeout(scheduleNextStain, getSpawnInterval());
}

