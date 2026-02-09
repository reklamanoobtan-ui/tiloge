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

// Session tracking for sidebar
let bossesDefeated = 0;
let totalStainsCleanedRel = 0;
let totalRepeatablePicked = 0; // Cap at 10

// Upgrades Tracking
let upgradeCounts = {
    'diff': 0,      // Max 5
    'speed': 0,     // Max 5
    'bot': 0,       // Max 5
    'radius': 0,    // Max 5
    'strength': 0,  // Max 5
    'karcher': 0,   // Max 1
    'bomb': 0,      // Max 1
    'coin_buff': 0, // Max 5
    'magnet': 0     // Max 1
};

// Helper Bot State (Roguelike only)
let activeHelpers = 0;
let helperSpeedMultiplier = 1.0;
let hasBombUpgrade = false;
let coinBonusMultiplier = 1.0;
let hasMagnetUpgrade = false;
let lastMilestoneScore = 0;

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
        clothEl.classList.remove('skin-fire', 'skin-ice', 'skin-jungle', 'skin-electric', 'skin-rainbow');
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
            coins INTEGER DEFAULT 0,
            survival_time INTEGER DEFAULT 0,
            best_score INTEGER DEFAULT 0,
            best_survival_time INTEGER DEFAULT 0,
            total_survival_time INTEGER DEFAULT 0,
            last_seen TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            is_vip BOOLEAN DEFAULT FALSE
        )`;

        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_score INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_survival_time INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_survival_time INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP DEFAULT NOW()`;

        // Drop UNIQUE constraint on nickname if it exists (for existing databases)
        try {
            await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_nickname_key`;
        } catch (e) { /* Constraint might not exist */ }

        // Create shared_scores table for shared results
        await sql`CREATE TABLE IF NOT EXISTS shared_scores (
            id SERIAL PRIMARY KEY,
            nickname TEXT NOT NULL,
            score INTEGER NOT NULL,
            survival_time INTEGER NOT NULL,
            efficiency FLOAT,
            is_vip BOOLEAN DEFAULT FALSE,
            shared_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            nickname TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS reset_codes (
            id SERIAL PRIMARY KEY,
            email TEXT,
            code TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )`;
    } catch (e) { console.error("DB Init Error", e); }
}

async function syncUserData(isFinal = false) {
    if (!userEmail) return;
    try {
        const currentSurvival = Math.floor((Date.now() - startTime) / 1000);
        // Live Update: Overwrite stats with current session values
        // Accumulate total time: we update last_seen and diff
        await sql`UPDATE users SET 
            score = ${Math.floor(score)},
            coins = ${coins},
            survival_time = ${currentSurvival},
            best_score = GREATEST(best_score, ${Math.floor(score)}),
            best_survival_time = GREATEST(best_survival_time, ${currentSurvival}),
            total_survival_time = total_survival_time + (CASE WHEN last_seen > NOW() - INTERVAL '30 seconds' THEN EXTRACT(EPOCH FROM (NOW() - last_seen)) ELSE 0 END),
            last_seen = NOW()
            WHERE email = ${userEmail}`;
    } catch (e) { }
}

async function fetchLeaderboard() {
    console.log("Leaderboard: Starting fetch...");
    const list = get('mini-lb-list');
    try {
        const result = await sql`
            SELECT nickname, 
                   GREATEST(COALESCE(best_score, 0), COALESCE(score, 0)) as d_score, 
                   CASE WHEN COALESCE(best_score, 0) > 0 THEN COALESCE(best_survival_time, 0) ELSE COALESCE(survival_time, 0) END as d_time,
                   CASE 
                       WHEN GREATEST(COALESCE(best_score, 0), COALESCE(score, 0)) > 0 
                       THEN CAST(GREATEST(COALESCE(best_score, 0), COALESCE(score, 0)) AS FLOAT) / NULLIF(CASE WHEN COALESCE(best_score, 0) > 0 THEN COALESCE(best_survival_time, 0) ELSE COALESCE(survival_time, 0) END, 0)
                       ELSE 0 
                   END as d_efficiency,
                   is_vip
            FROM users 
            WHERE nickname IS NOT NULL 
              AND nickname != ''
            ORDER BY d_efficiency DESC, d_score DESC
            LIMIT 10
        `;

        console.log("Leaderboard: Received " + result.length + " players");

        if (list) {
            list.innerHTML = '';
            if (result.length === 0) {
                list.innerHTML = '<p style="text-align: center; opacity: 0.5; padding: 10px; font-size: 0.8rem;">მოთამაშეები ვერ მოიძებნა</p>';
            } else {
                result.forEach((entry, i) => {
                    const isMe = nickname && entry.nickname === nickname;
                    const item = document.createElement('div');
                    item.className = 'mini-lb-item';
                    if (isMe) item.style.background = "rgba(255, 215, 0, 0.2)";

                    const scoreVal = parseFloat(entry.d_score || 0);
                    const timeVal = parseFloat(entry.d_time || 0);
                    const ld = entry.d_efficiency ? parseFloat(entry.d_efficiency).toFixed(2) : '0.00';

                    const crown = entry.is_vip ? '👑 ' : '';
                    const nameColor = entry.is_vip ? 'color: #ffd700; font-weight: 800;' : '';
                    const safeNick = entry.nickname.substring(0, 10);

                    item.innerHTML = `
                        <div class="mini-lb-info">
                            <span class="mini-lb-name" style="${nameColor}">${i + 1}. ${crown}${safeNick}</span>
                            <span class="mini-lb-stat">LD: ${ld} (⏱️ ${timeVal}s)</span>
                        </div>
                        <span class="mini-lb-score">${scoreVal} ✨</span>
                    `;
                    list.appendChild(item);
                });
            }
        }

        // Update Online Count
        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '2 minutes'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;

    } catch (e) {
        console.error("Leaderboard Error:", e);
        if (list) list.innerHTML = '<p style="text-align: center; color: #ff4d4d; font-size: 0.7rem; padding: 10px;">ბაზასთან კავშირი ვერ მოხერხდა</p>';
    }
}



async function fetchSharedScores() {
    const grid = get('ratings-grid');
    if (!grid) return;

    try {
        grid.innerHTML = '<p style="text-align: center; padding: 20px;">იტვირთება...</p>';

        // Default sort by shared_at DESC (Newest)
        let orderBy = 'shared_at DESC';
        const sortType = get('rating-sort-select') ? get('rating-sort-select').value : 'newest';

        if (sortType === 'score') orderBy = 'score DESC';
        else if (sortType === 'ld') orderBy = 'efficiency DESC';

        const result = await sql`
            SELECT nickname, score, survival_time, efficiency, is_vip, shared_at
            FROM shared_scores
            WHERE shared_at > NOW() - INTERVAL '1 minute'
            ORDER BY ${sql.unsafe(orderBy)}
            LIMIT 20
        `;

        if (result.length === 0) {
            grid.innerHTML = '<p style="text-align: center; opacity: 0.5; padding: 20px;">გაზიარებული შედეგები ვერ მოიძებნა</p>';
            return;
        }

        grid.innerHTML = '';
        result.forEach((player) => {
            const card = document.createElement('div');
            card.className = 'rating-card';
            if (player.is_vip) card.classList.add('vip-card');

            const scoreVal = parseFloat(player.score || 0);
            const timeVal = parseFloat(player.survival_time || 0);
            const ld = player.efficiency ? parseFloat(player.efficiency).toFixed(2) : '0.00';
            const crown = player.is_vip ? '👑 ' : '';

            // Calc remaining time for the card
            const sharedAt = new Date(player.shared_at).getTime();
            const nowTime = Date.now();
            const expiresAt = sharedAt + 60000;
            const remaining = Math.max(0, Math.ceil((expiresAt - nowTime) / 1000));

            card.innerHTML = `
                <div class="rating-timer" id="timer-${sharedAt}">${remaining}წმ</div>
                <h3>${crown}${player.nickname}</h3>
                <div class="rating-stats">
                    <div class="rating-stat">
                        <span>ქულა:</span>
                        <strong>${scoreVal} ✨</strong>
                    </div>
                    <div class="rating-stat">
                        <span>დრო:</span>
                        <strong>${timeVal}წმ ⏱️</strong>
                    </div>
                    <div class="rating-stat">
                        <span>ეფექტურობა:</span>
                        <strong>LD ${ld}</strong>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        // Start local timer updates for cards
        const updateCardsTime = () => {
            document.querySelectorAll('.rating-timer').forEach(t => {
                let s = parseInt(t.textContent);
                if (s > 0) t.textContent = (s - 1) + 'წმ';
                else t.closest('.rating-card').style.opacity = '0.3';
            });
        };
        if (window.cardTimerInterval) clearInterval(window.cardTimerInterval);
        window.cardTimerInterval = setInterval(updateCardsTime, 1000);

        // Auto-refresh every 15 seconds
        if (get('ratings-modal').classList.contains('hidden')) return;
        setTimeout(fetchSharedScores, 15000);
        fetchGlobalRankings(); // Also fetch global ones
    } catch (e) {
        console.error("Shared Scores Error:", e);
        grid.innerHTML = '<p style="text-align: center; color: #ff4d4d; padding: 20px;">შეცდომა მონაცემების ჩატვირთვისას</p>';
    }
}

async function fetchGlobalRankings() {
    if (get('ratings-modal').classList.contains('hidden')) return;

    const renderList = (id, data, suffix, statKey) => {
        const list = get(id);
        if (!list) return;
        list.innerHTML = '';
        data.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'mini-lb-item';
            const val = u[statKey] || 0;
            const crown = u.is_vip ? '👑 ' : '';
            const nameColor = u.is_vip ? 'color: #ffd700; font-weight: 800;' : '';
            item.innerHTML = `
                <div class="mini-lb-info">
                    <span class="mini-lb-name" style="${nameColor}">${i + 1}. ${crown}${u.nickname.substring(0, 10)}</span>
                </div>
                <span class="mini-lb-score">${val}${suffix}</span>
            `;
            list.appendChild(item);
        });
    };

    try {
        // Top Scores
        const topScores = await sql`SELECT nickname, best_score, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY best_score DESC LIMIT 10`;
        renderList('top-scores-list', topScores, '✨', 'best_score');

        // Top Coins
        const topCoins = await sql`SELECT nickname, coins, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY coins DESC LIMIT 10`;
        renderList('top-coins-list', topCoins, '🪙', 'coins');

        // Top Total Time
        const topTime = await sql`SELECT nickname, total_survival_time, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY total_survival_time DESC LIMIT 10`;
        renderList('top-time-list', topTime, 'წმ', 'total_survival_time');
    } catch (e) { console.error("Global Rankings Error:", e); }
}

async function shareScore(scoreVal, timeVal) {
    if (!nickname || scoreVal <= 0) {
        showStatusUpdate('შედეგი არასწორია! ❌');
        return;
    }

    // Restriction Check
    if (userEmail && userEmail.startsWith('guest_')) {
        get('restricted-modal').classList.remove('hidden');
        return;
    }

    // Circular Limit Check: If there are 20+ active, delete oldest one
    try {
        const activeRes = await sql`SELECT COUNT(*) as count FROM shared_scores WHERE shared_at > NOW() - INTERVAL '1 minute'`;
        if (activeRes[0].count >= 20) {
            // Delete oldest ACTIVE score to make room
            await sql`DELETE FROM shared_scores WHERE id = (
                SELECT id FROM shared_scores WHERE shared_at > NOW() - INTERVAL '1 minute' ORDER BY shared_at ASC LIMIT 1
            )`;
        }
    } catch (e) { }

    // Rate Limit Check: 5 minutes
    const lastShare = parseInt(localStorage.getItem('tilo_last_share')) || 0;
    const now = Date.now();
    const cooldown = 5 * 60 * 1000; // 5 mins

    if (now - lastShare < cooldown) {
        const remaining = Math.ceil((cooldown - (now - lastShare)) / 1000);
        showStatusUpdate(`მოიცადეთ ${remaining}წმ ⏳`);
        return;
    }

    try {
        const efficiency = timeVal > 0 ? scoreVal / timeVal : 0;

        await sql`INSERT INTO shared_scores (nickname, score, survival_time, efficiency, is_vip)
                  VALUES (${nickname}, ${scoreVal}, ${timeVal}, ${efficiency}, ${isVip})`;

        localStorage.setItem('tilo_last_share', now);
        updateShareButtonsUI();
        showStatusUpdate('შედეგი გაზიარდა! ✅');

        // Always show the ratings list after sharing
        get('settings-modal').classList.add('hidden');
        get('defeat-modal').classList.add('hidden');
        get('ratings-modal').classList.remove('hidden');
        fetchSharedScores();

    } catch (e) {
        console.error("Share Error:", e);
        showStatusUpdate('გაზიარება ვერ მოხერხდა! ❌');
    }
}

function updateShareButtonsUI() {
    const lastShare = parseInt(localStorage.getItem('tilo_last_share')) || 0;
    const now = Date.now();
    const cooldown = 5 * 60 * 1000;
    const diff = now - lastShare;

    const btns = ['share-rating-btn', 'share-best-btn', 'share-prev-btn'];
    const profileTimer = get('share-cooldown-timer');

    if (diff < cooldown) {
        const remaining = Math.ceil((cooldown - diff) / 1000);
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        const timeStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

        btns.forEach(id => {
            const b = get(id);
            if (b) {
                b.disabled = true;
                b.dataset.originalText = b.dataset.originalText || b.textContent;
                b.textContent = `⏳ ${timeStr}`;
            }
        });
        if (profileTimer) {
            profileTimer.textContent = `გაზიარება: ${timeStr}`;
            profileTimer.parentElement.classList.remove('hidden');
        }
    } else {
        btns.forEach(id => {
            const b = get(id);
            if (b && b.dataset.originalText) {
                b.disabled = false;
                b.textContent = b.dataset.originalText;
            }
        });
        if (profileTimer) profileTimer.parentElement.classList.add('hidden');
    }
}
setInterval(updateShareButtonsUI, 1000);



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

        // 1000 score milestone reward
        if (Math.floor(score / 1000) > Math.floor(lastMilestoneScore / 1000)) {
            coins += 1;
            showStatusUpdate('+1 ქოინი ბონუსი! 🪙');
            lastMilestoneScore = score;
            saveStatsToLocal();
        }

        // Sync every 20 points for "immediate" reflection
        if (Math.floor(score) % 20 === 0) {
            syncUserData(true);
        }

        updateUIValues();
        syncUserData();
        updateStatsSidebar();
    }
}

function updateStatsSidebar() {
    get('session-bosses').textContent = bossesDefeated;
    get('session-cleaned').textContent = totalStainsCleanedRel;

    const list = get('active-upgrades-list');
    list.innerHTML = '';

    const names = {
        'diff': 'სირთულე (⚡)',
        'speed': 'რობოტის სიჩქარე (🤖)',
        'bot': 'რობოტების რაოდენობა (🤖)',
        'radius': 'წმენდის რადიუსი (📏)',
        'strength': 'წმენდის ძალა (💪)',
        'karcher': 'კერხერი (🚿)',
        'bomb': 'ბომბი (💣)',
        'coin_buff': 'ქოინების ბონუსი (💰)',
        'magnet': 'მაგნიტი (🧲)'
    };

    let hasAny = false;
    for (const [id, count] of Object.entries(upgradeCounts)) {
        if (count > 0) {
            hasAny = true;
            const item = document.createElement('div');
            item.className = 'upgrade-stat-item';
            const cap = (id === 'karcher') ? 1 : 5;
            item.innerHTML = `<span>${names[id]}</span> <span>${count}/${cap}</span>`;
            list.appendChild(item);
        }
    }
    if (!hasAny) list.innerHTML = '<p style="font-size: 0.8rem; opacity: 0.5;">ჯერ არ გაქვთ</p>';
}


function showStatusUpdate(text) {
    const ds = get('diff-status');
    if (!ds) return;
    ds.textContent = text;
    ds.style.color = '#ffcc00';
    setTimeout(() => {
        const baseMsg = nickname ? `მოთამაშე: ${nickname}` : 'გამოიყენეთ ტილო საიტის გასაწმენდად';
        ds.textContent = baseMsg;
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
    get('buy-skin-rainbow').onclick = () => handleSkinAction('rainbow');

    // UI Toggle Logic
    get('ui-toggle-btn').onclick = () => get('ui-modal').classList.remove('hidden');
    get('close-ui').onclick = () => get('ui-modal').classList.add('hidden');

    // Side Menus Logic
    const statsMenu = get('top-stats-menu');
    const actionsMenu = get('top-actions-menu');

    get('top-stats-toggle').onclick = () => {
        statsMenu.classList.toggle('menu-open');
    };

    get('top-actions-toggle').onclick = () => {
        actionsMenu.classList.toggle('menu-open');
    };

    // Close side menus when clicking actions inside them
    document.querySelectorAll('.menu-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            actionsMenu.classList.remove('menu-open');
        });
    });

    // Pause Button Logic
    let isPaused = false;
    const pauseBtn = get('pause-btn');
    if (pauseBtn) {
        pauseBtn.onclick = () => {
            isPaused = !isPaused;
            gameActive = !isPaused;

            if (isPaused) {
                pauseBtn.textContent = '▶️ გაგრძელება';
                pauseBtn.style.background = 'rgba(76, 175, 80, 0.3)';
                showStatusUpdate('თამაში დაპაუზებულია ⏸️');
            } else {
                pauseBtn.textContent = '⏸️ პაუზა';
                pauseBtn.style.background = '';
                showStatusUpdate('თამაში გაგრძელდა ▶️');
                // Resume stain spawning
                scheduleNextStain();
            }
        };
    }

    // End Game Button
    get('end-game-btn').onclick = () => {
        if (confirm("ნამდვილად გსურთ თამაშის დასრულება?")) {
            gameOver();
        }
    };

    // Chat Side Toggle
    const chatSideToggle = get('chat-side-toggle');
    const chatToggleBtn = get('chat-toggle-btn');
    const globalChat = get('global-chat');

    if (chatSideToggle && globalChat) {
        chatSideToggle.onclick = () => {
            globalChat.classList.toggle('side-collapsed');
        };
    }

    if (chatToggleBtn && globalChat) {
        chatToggleBtn.onclick = () => {
            globalChat.classList.add('side-collapsed');
        };
    }

    // Logout Logic
    get('logout-btn').onclick = () => {
        localStorage.clear();
        location.reload();
    };

    // Update Profile Info in Settings
    get('settings-btn').onclick = () => {
        // Restriction Check for Profile
        if (userEmail && userEmail.startsWith('guest_')) {
            get('restricted-modal').classList.remove('hidden');
            return;
        }

        get('settings-modal').classList.remove('hidden');
        get('settings-user-name').textContent = nickname || 'სტუმარი';
        if (userEmail && !userEmail.startsWith('guest_')) {
            get('settings-user-email').textContent = userEmail;
        } else {
            get('settings-user-email').textContent = 'სტუმრის ანგარიში';
        }
    };

    // Ratings Modal
    get('ratings-btn').onclick = () => {
        get('ratings-modal').classList.remove('hidden');
        fetchSharedScores();
        fetchGlobalRankings();
    };
    get('close-ratings').onclick = () => get('ratings-modal').classList.add('hidden');

    get('show-shared-scores').onclick = () => {
        get('shared-scores-view').classList.remove('hidden');
        get('global-rankings-view').classList.add('hidden');
        get('show-shared-scores').style.opacity = "1";
        get('show-shared-scores').style.borderBottom = "3px solid var(--cloth-color)";
        get('show-global-best').style.opacity = "0.6";
        get('show-global-best').style.borderBottom = "none";
    };

    get('show-global-best').onclick = () => {
        get('shared-scores-view').classList.add('hidden');
        get('global-rankings-view').classList.remove('hidden');
        get('show-global-best').style.opacity = "1";
        get('show-global-best').style.borderBottom = "3px solid var(--cloth-color)";
        get('show-shared-scores').style.opacity = "0.6";
        get('show-shared-scores').style.borderBottom = "none";
        fetchGlobalRankings();
    };

    // Share Rating Button (from Game Over modal)
    get('share-rating-btn').onclick = async () => {
        const survival = Math.floor((Date.now() - startTime) / 1000);

        // Restriction Check
        if (userEmail && userEmail.startsWith('guest_')) {
            get('restricted-modal').classList.remove('hidden');
            return;
        }

        // Disable button to prevent double clicks
        const btn = get('share-rating-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'ზიარდება... ⌛';
        }

        await shareScore(Math.floor(score), survival);

        showStatusUpdate('შედეგი გაზიარდა! ვრესტარტდებით... 🔄');
        setTimeout(() => {
            if (userEmail && !userEmail.startsWith('guest_')) {
                // If registered, just restart logic without reload or check persistence
                startGameSession(); // Default resets round
                get('defeat-modal').classList.add('hidden');
                get('ratings-modal').classList.add('hidden');
                // We need to clear stains though
                document.querySelectorAll('.stain').forEach(s => s.remove());
            } else {
                location.reload();
            }
        }, 2000);
    };

    // --- Profile Management Listeners ---

    // Update Profile (Nickname/Email)
    get('update-profile-btn').onclick = async () => {
        const newNick = get('edit-nick').value.trim();
        const newEmail = get('edit-email').value.trim();

        if (!newNick && !newEmail) {
            alert('შეიყვანეთ ახალი მონაცემები!');
            return;
        }

        try {
            if (newNick) {
                // Check if nick taken
                const check = await sql`SELECT id FROM users WHERE nickname = ${newNick} AND email != ${userEmail}`;
                if (check.length > 0) {
                    alert('ეს ნიკნეიმი უკვე დაკავებულია!');
                    return;
                }
                await sql`UPDATE users SET nickname = ${newNick} WHERE email = ${userEmail}`;
                nickname = newNick;
                localStorage.setItem('tilo_nick', nickname);
            }

            if (newEmail) {
                // Check if email taken
                const check = await sql`SELECT id FROM users WHERE email = ${newEmail}`;
                if (check.length > 0) {
                    alert('ეს ემაილი უკვე დაკავებულია!');
                    return;
                }
                await sql`UPDATE users SET email = ${newEmail} WHERE email = ${userEmail}`;
                userEmail = newEmail;
                localStorage.setItem('tilo_email', userEmail);
            }

            showStatusUpdate('პროფილი განახლდა! ✨');
            get('settings-user-name').textContent = nickname;
            get('settings-user-email').textContent = userEmail;
            get('edit-nick').value = '';
            get('edit-email').value = '';
        } catch (e) {
            console.error(e);
            alert('შეცდომა განახლებისას');
        }
    };

    // Update Password
    get('update-pass-btn').onclick = async () => {
        const newPass = get('edit-pass').value.trim();
        if (!newPass) {
            alert('შეიყვანეთ ახალი პაროლი!');
            return;
        }

        try {
            await sql`UPDATE users SET password = ${newPass} WHERE email = ${userEmail}`;
            showStatusUpdate('პაროლი შეიცვალა! 🔑');
            get('edit-pass').value = '';
        } catch (e) {
            console.error(e);
            alert('შეცდომა პაროლის შეცვლისას');
        }
    };

    // Forgot Password Flow
    get('forgot-pass-btn').onclick = (e) => {
        e.preventDefault();
        get('reset-form').classList.toggle('hidden');
    };

    get('request-reset-btn').onclick = async () => {
        const email = get('reset-email').value.trim();
        if (!email) {
            alert('შეიყვანეთ ემაილი!');
            return;
        }

        try {
            const userCheck = await sql`SELECT id FROM users WHERE email = ${email}`;
            if (userCheck.length === 0) {
                alert('მომხმარებელი ამ ემაილით არ მოიძებნა');
                return;
            }

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            await sql`DELETE FROM reset_codes WHERE email = ${email}`;
            await sql`INSERT INTO reset_codes (email, code) VALUES (${email}, ${code})`;

            // Simulating email send
            alert(`თქვენს ემაილზე გაიგზავნა კოდი! (სიმულაცია: ${code})`);
            get('verify-reset-section').classList.remove('hidden');
            get('request-reset-btn').textContent = 'კოდი თავიდან გაგზავნა';
        } catch (e) {
            console.error(e);
            alert('შეცდომა კოდის გაგზავნისას');
        }
    };

    get('verify-reset-btn').onclick = async () => {
        const email = get('reset-email').value.trim();
        const code = get('reset-code').value.trim();
        const newPass = get('reset-new-pass').value.trim();

        if (!code || !newPass) {
            alert('შეავსეთ ყველა ველი!');
            return;
        }

        try {
            const check = await sql`SELECT id FROM reset_codes WHERE email = ${email} AND code = ${code}`;
            if (check.length === 0) {
                alert('არასწორი კოდი!');
                return;
            }

            await sql`UPDATE users SET password = ${newPass} WHERE email = ${email}`;
            await sql`DELETE FROM reset_codes WHERE email = ${email}`;

            alert('პაროლი წარმატებით შეიცვალა! ახლა შეგიძლიათ შეხვიდეთ ახალი პაროლით.');
            get('reset-form').classList.add('hidden');
            get('verify-reset-section').classList.add('hidden');
            get('reset-email').value = '';
            get('reset-code').value = '';
            get('reset-new-pass').value = '';
            switchToLogin();
        } catch (e) {
            console.error(e);
            alert('შეცდომა პაროლის განახლებისას');
        }
    };

    // Share Best Score Button
    get('share-best-btn').onclick = () => {
        const bestData = JSON.parse(localStorage.getItem('tilo_best_score')) || { score: 0, time: 0 };
        shareScore(bestData.score, bestData.time);
    };

    // Share Previous Score Button
    get('share-prev-btn').onclick = () => {
        const prevData = JSON.parse(localStorage.getItem('tilo_prev_score')) || { score: 0, time: 0 };
        shareScore(prevData.score, prevData.time);
    };

    // Revive Button
    get('revive-btn').onclick = () => reviveGame();

    const loadUIState = () => {
        const uiState = JSON.parse(localStorage.getItem('tilo_ui_state')) || { stats: true, chat: true };
        get('toggle-stats').checked = uiState.stats;
        get('toggle-chat').checked = uiState.chat;

        const statsEl = document.querySelector('.user-stats');
        if (statsEl) statsEl.style.display = uiState.stats ? 'flex' : 'none';

        const chat = get('global-chat');
        if (chat) chat.style.display = uiState.chat ? 'flex' : 'none';
    };

    get('toggle-stats').onchange = (e) => {
        const show = e.target.checked;
        const statsEl = document.querySelector('.user-stats');
        if (statsEl) statsEl.style.display = show ? 'flex' : 'none';
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

    // Initialize UI State
    loadUIState();

    get('shop-btn').onclick = () => get('shop-modal').classList.remove('hidden');
    get('close-shop').onclick = () => get('shop-modal').classList.add('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('restart-game-btn').onclick = () => {
        if (userEmail && !userEmail.startsWith('guest_')) {
            startGameSession(); // Default resets round state
            get('defeat-modal').classList.add('hidden');
            document.querySelectorAll('.stain').forEach(s => s.remove());
        } else {
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
            SELECT DISTINCT ON (cm.id) cm.*, u.is_vip
            FROM chat_messages cm
            LEFT JOIN users u ON cm.nickname = u.nickname
            WHERE cm.created_at > NOW() - INTERVAL '30 seconds'
            ORDER BY cm.id, cm.created_at ASC
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
    botEl.innerHTML = '🤖';
    if (isVip) botEl.classList.add('vip-rainbow-trail');
    container.appendChild(botEl);

    function moveBot() {
        if (!botEl.parentElement) return;
        if (!gameActive) {
            setTimeout(moveBot, 500); // Wait for resume
            return;
        }

        const stains = document.querySelectorAll('.stain');
        if (stains.length > 0) {
            // Find closest stain
            let closest = null;
            let minDist = Infinity;
            const botRect = botEl.getBoundingClientRect();
            const bx = botRect.left + botRect.width / 2;
            const by = botRect.top + botRect.height / 2;

            stains.forEach(s => {
                const sRect = s.getBoundingClientRect();
                const sx = sRect.left + sRect.width / 2;
                const sy = sRect.top + sRect.height / 2;
                const d = Math.hypot(bx - sx, by - sy);
                if (d < minDist) {
                    minDist = d;
                    closest = s;
                }
            });

            if (closest) {
                const rect = closest.getBoundingClientRect();
                botEl.style.left = `${rect.left + rect.width / 2 - 30}px`;
                botEl.style.top = `${rect.top + rect.height / 2 - 30}px`;

                setTimeout(() => {
                    if (closest.parentElement) {
                        let h = parseFloat(closest.dataset.health);
                        h -= 80; // Improved robot cleaning power
                        closest.dataset.health = h;
                        closest.style.opacity = Math.max(0.2, h / parseFloat(closest.dataset.maxHealth));
                        if (h <= 0 && closest.dataset.cleaning !== 'true') {
                            closest.dataset.cleaning = 'true';
                            createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, closest.style.backgroundColor);

                            const isBoss = closest.classList.contains('boss-stain');
                            const isTriangle = closest.classList.contains('triangle-boss');
                            const rMult = parseFloat(closest.dataset.rewardMult || 1.0);

                            if (isTriangle) {
                                bossesDefeated++;
                                const finalRew = Math.floor(20 * rMult);
                                updateScore(finalRew);
                                showStatusUpdate(`ელიტარული ბოსი დამარცხებულია! +${finalRew} ✨`);
                            } else if (isBoss) {
                                bossesDefeated++;
                                const finalRew = Math.floor(10 * rMult);
                                updateScore(finalRew);
                                showStatusUpdate(`ბოსი დამარცხებულია! +${finalRew} ✨`);
                            } else {
                                totalStainsCleanedRel++;
                                updateScore(1);
                            }

                            setTimeout(() => closest.remove(), 400); // Faster cleanup animation
                        }
                    }
                    moveBot();
                }, (1000 / helperSpeedMultiplier)); // Faster base transition
            } else {
                setTimeout(moveBot, 500);
            }
        } else {
            botEl.style.left = `${Math.random() * (window.innerWidth - 60)}px`;
            botEl.style.top = `${Math.random() * (window.innerHeight - 60)}px`;
            setTimeout(moveBot, 1000);
        }
    }
    moveBot();

    // Magnet functionality if owned
    setInterval(() => {
        if (hasMagnetUpgrade && gameActive) {
            const stains = document.querySelectorAll('.stain');
            if (stains.length > 0) {
                const target = stains[0];
                const rect = target.getBoundingClientRect();
                createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, '#4facfe', 10);
                let h = parseFloat(target.dataset.health);
                target.dataset.health = h - 200; // Magnet cleans bit by bit
                if (h <= 200) target.dataset.health = 0; // Ensure removal
                checkCleaning(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
        }
    }, 3000);
}

function applyUpgrade(id) {
    isUpgradeOpen = false; // Clear flag before resuming loop
    switch (id) {
        case 'diff': intervalMultiplier *= 0.85; break; // Balanced
        case 'speed': helperSpeedMultiplier *= 1.25; break;
        case 'bot': startHelperBot(); break;
        case 'radius': radiusMultiplier *= 1.25; updatePowerStats(); break;
        case 'strength': strengthMultiplier *= 1.25; updatePowerStats(); break;
        case 'karcher': strengthMultiplier *= 2; radiusMultiplier *= 2; updatePowerStats(); break;
        case 'bomb': hasBombUpgrade = true; break;
        case 'coin_buff': coinBonusMultiplier += 0.1; break;
        case 'magnet': hasMagnetUpgrade = true; break;
    }
    updateUIValues();
    scheduleNextStain(); // Resume spawn loop
}

function closeUpgradeModal() {
    get('upgrade-modal').classList.add('hidden');
    isUpgradeOpen = false;
}

function showUpgradeOptions() {
    isUpgradeOpen = true;
    get('upgrade-modal').classList.remove('hidden');

    const UPGRADE_POOL = [
        { id: 'diff', icon: '⚡', title: 'სირთულე', desc: '+10% სირთულე', type: 'multi' },
        { id: 'speed', icon: '🤖', title: 'რობოტის სიჩქარე', desc: '+30% სისწრაფე', type: 'multi' },
        { id: 'bot', icon: '🤖', title: 'რობოტი', desc: '+1 რობოტი', type: 'multi' },
        { id: 'radius', icon: '📏', title: 'რადიუსი', desc: '+30% რადიუსი', type: 'multi' },
        { id: 'strength', icon: '💪', title: 'ტილოს ძალა', desc: '+30% ძალა', type: 'multi' },
        { id: 'karcher', icon: '🚿', title: 'კერხერი', desc: 'ორმაგი ძალა და რადიუსი (X2)', type: 'once' },
        { id: 'bomb', icon: '💣', title: 'ბომბი', desc: 'წმენდისას ახლოს მყოფებსაც წმენდს', type: 'once' },
        { id: 'coin_buff', icon: '💰', title: 'ქოინების ბონუსი', desc: '+10% ქოინების მოგება (Max 5)', type: 'multi' },
        { id: 'magnet', icon: '🧲', title: 'მაგნიტი', desc: 'ავტომატური წმენდა ყოველ 3 წამში', type: 'once' }
    ];

    // Filter available upgrades based on limits
    const available = UPGRADE_POOL.filter(u => {
        if (u.id === 'karcher' || u.id === 'bomb' || u.id === 'magnet') return (upgradeCounts[u.id] || 0) < 1;
        if (u.id === 'bot') return (upgradeCounts[u.id] || 0) < 15;
        // Strict limit of 5 per repeatable upgrade
        return (upgradeCounts[u.id] || 0) < 5;
    });

    // If no upgrades available, close and return
    if (available.length === 0) {
        closeUpgradeModal();
        triggerEndgame(); // If no upgrades, trigger endgame
        return;
    }

    const shuffled = available.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    const container = get('upgrade-cards-container');
    container.innerHTML = '';

    selected.forEach(upg => {
        const card = document.createElement('div');
        card.className = 'upgrade-card';
        card.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px;">${upg.icon}</div>
            <h3 style="margin-bottom: 10px;">${upg.title}</h3>
            <p style="font-size: 0.9rem; opacity: 0.8;">${upg.desc}</p>
        `;
        card.onclick = () => {
            applyUpgrade(upg.id);
            if (upg.type === 'multi') totalRepeatablePicked++;
            upgradeCounts[upg.id]++;
            closeUpgradeModal();
            updateStatsSidebar();
        };
        container.appendChild(card);
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


function createParticles(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
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

function createStain(isBoss = false, isTriangle = false, healthMultiplier = 1.0) {
    const container = get('canvas-container');
    if (!container || !gameActive) return;

    // Strict limit of 300 stains to prevent lag
    const currentStains = document.querySelectorAll('.stain').length;
    if (currentStains >= 300) return;

    const stain = document.createElement('div');
    stain.className = 'stain';

    let health = 100;
    let size = Math.random() * 100 + 50;

    if (isBoss) {
        stain.classList.add('boss-stain');
        stain.classList.add('pulse-animation');

        // Every 10,000 score scaling (doubles at each milestone)
        let scalingFactor = Math.pow(2, Math.floor(score / 10000));
        let baseHealth = isTriangle ? 9000 : 3000;

        health = baseHealth * scalingFactor * healthMultiplier;
        size = isTriangle ? 300 : 250;

        if (isTriangle) {
            stain.classList.add('triangle-boss');
            stain.innerHTML = '<div class="boss-title" style="color: #ffd700 !important; text-shadow: 0 0 10px gold;">ELITE BOSS</div>';
        } else {
            stain.innerHTML = '<div class="boss-title">BOSS</div>';
        }
    } else {
        // Random shape and color behavior
        const type = Math.random();
        if (type < 0.2) { // 20% Circle Blue
            stain.classList.add('stain-circle');
            stain.style.backgroundColor = 'rgba(0, 102, 255, 0.4)';
        } else if (type < 0.4) { // 20% Triangle Yellow
            stain.classList.add('stain-triangle');
            stain.style.backgroundColor = 'rgba(255, 204, 0, 0.4)';
        } else { // 60% Square (randomish colors)
            const colors = ['rgba(255, 77, 77, 0.3)', 'rgba(77, 255, 77, 0.3)', 'rgba(155, 77, 255, 0.3)'];
            stain.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    stain.style.width = `${size}px`;
    stain.style.height = `${size}px`;
    stain.style.left = `${Math.random() * (window.innerWidth - size)}px`;
    stain.style.top = `${Math.random() * (window.innerHeight - size)}px`;
    stain.dataset.health = health;
    stain.dataset.maxHealth = health;
    stain.dataset.rewardMult = healthMultiplier;

    if (isBoss && !isTriangle) { // Only increment bossCount for regular bosses
        bossCount++;
    } else if (isTriangle) {
        bossCount++; // Also count triangle bosses in general boss count
    }

    container.appendChild(stain);
    checkDefeatCondition();
}

function checkDefeatCondition() {
    if (!gameActive) return;
    const totalCount = document.querySelectorAll('.stain').length;
    const bossCountUI = document.querySelectorAll('.boss-stain:not(.triangle-boss)').length;
    const triangleBossCountUI = document.querySelectorAll('.triangle-boss').length;
    const inactiveTime = (Date.now() - lastActivityTime) / 1000;

    // Trigger crisis only if screen is actually dirty AND player is inactive
    const isCrisis = totalCount >= 200 || (totalCount > 10 && inactiveTime > 60) || bossCountUI >= 10 || triangleBossCountUI >= 5;

    if (isCrisis && !defeatTimer) {
        let timeLeft = 30;
        defeatTimer = setInterval(() => {
            if (!gameActive) { clearInterval(defeatTimer); defeatTimer = null; return; }
            timeLeft--;
            if (timeLeft <= 0) { clearInterval(defeatTimer); gameOver(); }
            else if (timeLeft % 5 === 0) {
                let reason = "ჭუჭყი ბევრია!";
                if (inactiveTime > 30) reason = "არააქტიური ხარ!";
                else if (bossCountUI >= 10) reason = "ბოსების შემოსევა!";
                else if (triangleBossCountUI >= 5) reason = "სამკუთხედი ბოსების ალყა! ⚠️";
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
    coins += Math.floor((Math.floor(score * 0.5) + Math.floor(survival * 0.2)) * coinBonusMultiplier);


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

async function reviveGame() {
    if (coins < 1000) {
        showStatusUpdate('არ გაქვს საკმარისი ქოინები! (1000 🪙) ❌');
        return;
    }

    if (confirm('ნამდვილად გსურთ 1000 ქოინის დახარჯვა და თამაშის გაგრძელება?')) {
        coins -= 1000;
        saveStatsToLocal();
        updateUIValues();

        // Clear all stains
        document.querySelectorAll('.stain').forEach(s => s.remove());

        // Reset defeat timer and state
        if (defeatTimer) {
            clearInterval(defeatTimer);
            defeatTimer = null;
        }

        get('defeat-modal').classList.add('hidden');
        gameActive = true;

        // Resume loops
        lastActivityTime = Date.now();
        scheduleNextStain();
        showStatusUpdate('თამაში გაგრძელდა! ✨💪');
        syncUserData(true);
    }
}

// User Interaction (Mouse/Touch)
document.addEventListener('mousemove', (e) => {
    if (!gameActive) return;
    lastActivityTime = Date.now();
    currentX = e.clientX;
    currentY = e.clientY;
    moveCloth(currentX, currentY);
});

document.addEventListener('touchmove', (e) => {
    if (!gameActive) return;
    lastActivityTime = Date.now();
    e.preventDefault();
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    moveCloth(currentX, currentY);
}, { passive: false });

// Auto-cleaning loop
setInterval(() => {
    if (!gameActive) return;
    if (currentX && currentY) {
        checkCleaning(currentX, currentY);
        // lastActivityTime handled in mouse/touch move
    }
}, 50);



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

        // Radius check
        const hitRadius = (50 * cleaningRadius) + (rect.width / 2);

        if (dist < hitRadius) {
            let h = parseFloat(stain.dataset.health);
            let effectiveDmg = clothStrength;

            h -= effectiveDmg;
            stain.dataset.health = h;

            // Visual fade
            const maxH = parseFloat(stain.dataset.maxHealth);
            stain.style.opacity = Math.max(0.2, h / maxH);

            if (h <= 0 && stain.dataset.cleaning !== 'true') {
                stain.dataset.cleaning = 'true';

                const isBoss = stain.classList.contains('boss-stain');
                const isTriangle = stain.classList.contains('triangle-boss');
                const rMult = parseFloat(stain.dataset.rewardMult || 1.0);

                if (isTriangle) {
                    bossesDefeated++;
                    const finalRew = Math.floor(20 * rMult);
                    updateScore(finalRew);
                    showStatusUpdate(`ელიტარული ბოსი დამარცხებულია! +${finalRew} ✨`);
                    createParticles(sx, sy, '#ffd700', 40);
                } else if (isBoss) {
                    bossesDefeated++;
                    const finalRew = Math.floor(10 * rMult);
                    updateScore(finalRew);
                    showStatusUpdate(`ბოსი დამარცხებულია! +${finalRew} ✨`);
                    createParticles(sx, sy, '#ff4d4d', 30);
                } else {
                    totalStainsCleanedRel++;
                    updateScore(1);
                    createParticles(sx, sy, stain.style.backgroundColor || '#fff', 10);
                }

                // Bomb Upgrade: Chain Reaction
                if (hasBombUpgrade) {
                    const allStains = document.querySelectorAll('.stain');
                    allStains.forEach(s => {
                        const sRect = s.getBoundingClientRect();
                        const distS = Math.hypot(sx - (sRect.left + sRect.width / 2), sy - (sRect.top + sRect.height / 2));
                        if (distS < 200 && s !== stain) {
                            let sh = parseFloat(s.dataset.health);
                            s.dataset.health = sh - 500; // Heavy damage to neighbors
                            if (sh - 500 <= 0) checkCleaning(currentX, currentY); // Trigger cleanup
                        }
                    });
                }

                setTimeout(() => stain.remove(), 100);
            }
        }
    });
}

// Init
window.onload = async () => {
    initUI();
    await initDatabase();

    // Check persistent session for real users only
    const savedEmail = localStorage.getItem('tilo_email');
    if (savedEmail && !savedEmail.startsWith('guest_')) {
        userEmail = savedEmail;
        nickname = localStorage.getItem('tilo_nick');
        coins = parseInt(localStorage.getItem('tilo_coins')) || 0;
        isVip = localStorage.getItem('tilo_vip') === 'true';
        startGameSession(true);
    } else {
        document.querySelectorAll('.hidden-game-ui').forEach(el => el.classList.add('hidden'));
    }

    // Statistics Sidebar Logic
    get('stats-side-toggle').onclick = () => get('stats-sidebar').classList.toggle('side-collapsed');
    get('stats-close-btn').onclick = () => get('stats-sidebar').classList.add('side-collapsed');

    // Chat Sidebar Logic
    get('chat-side-toggle').onclick = () => get('global-chat').classList.toggle('side-collapsed');
    get('chat-toggle-btn').onclick = () => get('global-chat').classList.add('side-collapsed');

    // Modal Closers
    const closeAuth = () => {
        get('auth-modal').classList.add('hidden');
        get('auth-modal').classList.remove('auth-open-side');
        document.body.classList.remove('auth-visual-open');
    };
    get('close-auth').onclick = closeAuth;
    get('close-restricted').onclick = () => get('restricted-modal').classList.add('hidden');
    get('not-now-btn').onclick = () => get('restricted-modal').classList.add('hidden');
    get('go-to-register-btn').onclick = () => {
        get('restricted-modal').classList.add('hidden');
        get('auth-modal').classList.remove('hidden');
        switchToRegister();
    };

    // Mode Toggle Logic
    let authMode = 'login';
    const switchToLogin = () => {
        authMode = 'login';
        get('auth-title').textContent = "ავტორიზაცია";
        get('nick-field').style.display = 'none';
        get('auth-email').placeholder = "ელ-ფოსტა / ნიკნეიმი";
        get('auth-submit-btn').textContent = "შესვლა";
        get('show-login-btn').style.background = 'var(--cloth-color)';
        get('show-register-btn').style.background = '';
        get('auth-error').textContent = '';
        get('reset-form').classList.add('hidden');
    };

    const switchToRegister = () => {
        authMode = 'register';
        get('auth-title').textContent = "რეგისტრაცია";
        get('nick-field').style.display = 'block';
        get('auth-email').placeholder = "ელ-ფოსტა";
        get('auth-submit-btn').textContent = "რეგისტრაცია";
        get('show-register-btn').style.background = 'var(--cloth-color)';
        get('show-login-btn').style.background = '';
        get('auth-error').textContent = '';
        get('reset-form').classList.add('hidden');
    };

    get('show-login-btn').onclick = switchToLogin;
    get('show-register-btn').onclick = switchToRegister;
    get('open-auth-btn').onclick = () => {
        const isStartScreen = !get('game-start-overlay').classList.contains('hidden');
        get('auth-modal').classList.remove('hidden');
        if (isStartScreen) {
            get('auth-modal').classList.add('auth-open-side');
            document.body.classList.add('auth-visual-open');
        }
        switchToLogin();
    };

    // Submit Auth
    get('auth-submit-btn').onclick = async () => {
        const nickValue = get('nickname-input').value.trim();
        const identValue = get('auth-email').value.trim();
        const passValue = get('auth-password').value.trim();
        const errorEl = get('auth-error');

        if (!identValue || !passValue) { errorEl.textContent = "შეავსეთ ველები!"; return; }

        try {
            if (authMode === 'register') {
                if (!nickValue) { errorEl.textContent = "შეიყვანეთ ნიკნეიმი!"; return; }
                const check = await sql`SELECT id FROM users WHERE nickname = ${nickValue} OR email = ${identValue}`;
                if (check.length > 0) { errorEl.textContent = "ნიკნეიმი ან ემაილი დაკავებულია!"; return; }

                await sql`INSERT INTO users (email, password, nickname, coins) VALUES (${identValue}, ${passValue}, ${nickValue}, 0)`;
                userEmail = identValue;
                nickname = nickValue;
                coins = 0;
                isVip = false;
            } else {
                const res = await sql`SELECT * FROM users WHERE (email = ${identValue} OR nickname = ${identValue}) AND password = ${passValue}`;
                if (res.length === 0) { errorEl.textContent = "არასწორი მონაცემები!"; return; }
                const user = res[0];
                nickname = user.nickname;
                userEmail = user.email;
                coins = user.coins || 0;
                isVip = user.is_vip || false;
            }

            localStorage.setItem('tilo_nick', nickname);
            localStorage.setItem('tilo_email', userEmail);
            localStorage.setItem('tilo_coins', coins);
            localStorage.setItem('tilo_vip', isVip);

            get('auth-modal').classList.add('hidden');
            get('auth-modal').classList.remove('auth-open-side');
            document.body.classList.remove('auth-visual-open');
            startGameSession(true);
        } catch (e) {
            console.error(e);
            errorEl.textContent = "შეცდომა ბაზასთან!";
        }
    };

    // Guest Play Button
    get('play-game-btn').onclick = async () => {
        const inputNick = get('player-nick').value.trim();
        const errorEl = get('start-error');
        if (!inputNick) {
            errorEl.textContent = "შეიყვანეთ ნიკნეიმი!";
            return;
        }

        try {
            // Check if this nickname is registered
            const res = await sql`SELECT email FROM users WHERE nickname = ${inputNick} AND email NOT LIKE 'guest_%'`;
            if (res.length > 0) {
                errorEl.textContent = "ეს ნიკნეიმი ეკუთვნის დარეგისტრირებულ მომხმარებელს! 🔐";
                return;
            }

            nickname = inputNick;
            localStorage.setItem('tilo_nick', nickname);

            // Generate temp email/pass for session
            const sessionID = Date.now();
            userEmail = `guest_${sessionID}@tilo.ge`;
            const sessionPass = `pass_${sessionID}`;

            await sql`INSERT INTO users(email, password, nickname, coins) VALUES(${userEmail}, ${sessionPass}, ${nickname}, 0)`;
            startGameSession();
        } catch (e) {
            console.error("Login Error", e);
            errorEl.textContent = "შეცდომა! თავიდან სცადეთ.";
        }
    };

    setupChat();
};


function startGameSession(dontReset = false) {
    if (!dontReset) {
        // Meta-progress (isVip, coins, skins) is kept from global loads
        bossesDefeated = 0;
        totalStainsCleanedRel = 0;
        totalRepeatablePicked = 0;
        upgradeCounts = {
            'diff': 0, 'speed': 0, 'bot': 0, 'radius': 0, 'strength': 0, 'karcher': 0,
            'bomb': 0, 'coin_buff': 0, 'magnet': 0
        };

        // Reset Upgrades
        intervalMultiplier = 1.0;
        radiusMultiplier = 1.0;
        strengthMultiplier = 1.0;
        activeHelpers = 0;
        helperSpeedMultiplier = 1.0;
        hasBombUpgrade = false;
        coinBonusMultiplier = 1.0;
        hasMagnetUpgrade = false;
        lastMilestoneScore = 0;
        document.querySelectorAll('.helper-bot').forEach(b => b.remove());
    }

    score = 0;
    updatePowerStats();
    showStatusUpdate(`მოგესალმებით, ${nickname}! ✨`);

    // Apply UI
    get('game-start-overlay').classList.add('hidden');
    document.querySelectorAll('.hidden-game-ui').forEach(el => {
        el.classList.remove('hidden-game-ui');
        el.classList.remove('hidden');
    });

    // Reset Side Menus
    get('top-stats-menu').classList.remove('menu-open');
    get('top-actions-menu').classList.remove('menu-open');

    // Start Loops
    gameActive = true;
    startTime = Date.now();
    lastActivityTime = Date.now();
    scheduleNextStain();

    // Boss spawning interval
    setInterval(() => {
        if (gameActive) {
            // General Bosses (Cap at 10, scale health for overflow)
            const rawBossCount = Math.floor(score / 500) + 1;
            const finalBossSpawn = Math.min(rawBossCount, 10);
            const bossHealthMult = rawBossCount > 10 ? (rawBossCount / 10) : 1.0;

            for (let i = 0; i < finalBossSpawn; i++) {
                createStain(true, false, bossHealthMult);
            }

            // Triangle Elite Bosses (Cap at 5, scale health for overflow)
            if (score >= 1000) {
                const rawTriangleCount = Math.floor((score - 1000) / 1000) + 1;
                const finalTriangleSpawn = Math.min(rawTriangleCount, 5);
                const triangleHealthMult = rawTriangleCount > 5 ? (rawTriangleCount / 5) : 1.0;

                for (let i = 0; i < finalTriangleSpawn; i++) {
                    createStain(true, true, triangleHealthMult);
                }
            }
        }
    }, 60000);

    // Defeat condition check
    setInterval(checkDefeatCondition, 1000);

    // Round Timer
    setInterval(() => {
        if (gameActive) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            if (get('round-timer-val')) get('round-timer-val').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        }
    }, 1000);

    // Sync loop
    setInterval(() => { if (userEmail && gameActive) syncUserData(); }, 3000);
}

let spawnTimeout;
function scheduleNextStain() {
    clearTimeout(spawnTimeout);
    spawnTimeout = null;
    if (isUpgradeOpen || !gameActive) return;
    createStain();
    spawnTimeout = setTimeout(scheduleNextStain, getSpawnInterval());
}

