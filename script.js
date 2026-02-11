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
let accumulatedScore = 0; // Score from previous sub-sessions (before revives)
let sessionCoinsEarned = 0; // Coins earned in the current run (milestones, etc.)

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
let soapClickCount = 0;
let lastSoapMilestone = 0;
let lastSpinMilestone = 0;
let isSoapActive = false;
let magnetInterval = 3000;
let pendingUpgrades = 0;
let lastMinigameMilestone = 0;
let isMinigameActive = false;
let minigameTimer = null;
let healthHalvedActive = false;
let consecutiveCoinBuffs = 0;

async function logToAdmin(msg, level = 'INFO') {
    try {
        await sql`INSERT INTO chat_messages (nickname, message) VALUES ('SYSTEM_LOG', ${level + '|' + msg})`;
    } catch (e) { console.error('Log failed', e); }
}
let halfHealthEndTime = 0;

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
    'magnet': 0,     // Max 1
    'bot_pow': 0,   // Max 5
    'spawn_speed': 0,
    'boss_weaken': 0
};

let pinkBonuses = []; // Track which pink bonuses have been applied

let helperCleaningMultiplier = 1.0;

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
let spawnSpeedUpgradeMultiplier = 1.0;
let bossWeaknessMultiplier = 1.0;

// Base stats
let baseClothStrength = 20; // Reverted to 20 (Harder)
let clothStrength = 0;
let cleaningRadius = 1;

// Admin-controlled game parameters
let globalBossInterval = 60000; // Boss spawn interval in milliseconds (default 60s)
let globalTriangleBossInterval = 120000; // Triangle boss spawn interval
let globalUpgradePower = 1.3; // Upgrade multiplier (default 1.3 = +30%)
let globalPinkUpgradePower = 1.5; // Pink upgrade multiplier (default 1.5 = +50%)
let globalBossOpacity = 1.0; // Boss opacity (1-10 scale, converted to 0.1-1.0)
let globalTriangleBossHP = 30000; // Triangle boss HP override
let globalTriangleBossImage = null;
let globalTriangleBossScale = 1.0;
let globalTriangleBossOpacity = 1.0;
let globalRegularBossThreshold = 500; // Score threshold for regular bosses
let globalTriangleBossThreshold = 1000; // Score threshold for triangle bosses
let lastSpawnEventId = 0; // Track last processed immediate spawn

// Global Interval IDs to prevent stacking
let bossInterval = null;
let triBossInterval = null;
let defeatCheckInterval = null;
let timerInterval = null;
let syncLoopInterval = null;


// --- Helper Functions ---

function updatePowerStats() {
    let power = baseClothStrength * strengthMultiplier * globalStrengthMult;
    const clothEl = get('cloth');

    cleaningRadius = 1 * radiusMultiplier * globalRadiusMult;
    clothStrength = power;

    // Apply Current Skin (Clean removal of ALL possible skin classes)
    if (clothEl) {
        const allPossibleSkins = [
            'skin-fire', 'skin-ice', 'skin-electric', 'skin-rainbow',
            'cloth-skin-fire', 'cloth-skin-ice', 'cloth-skin-electric', 'cloth-skin-rainbow'
        ];
        clothEl.classList.remove(...allPossibleSkins);

        if (currentSkin !== 'default') {
            clothEl.classList.add(`cloth-skin-${currentSkin}`);
        }
    }
}

function saveStatsToLocal() {
    localStorage.setItem('tilo_coins', coins);
    localStorage.setItem('tilo_vip', isVip);
    localStorage.setItem('tilo_owned_skins', JSON.stringify(ownedSkins));
    localStorage.setItem('tilo_current_skin', currentSkin);

    // 🛡️ Security: Update integrity hash after saving
    if (window.securitySystem) {
        window.securitySystem.verifyStorageIntegrity();
    }
}

function updateUIValues() {
    if (get('coins-val')) get('coins-val').textContent = coins;
    if (get('score-val')) {
        const displayScore = Math.floor(score);
        get('score-val').textContent = accumulatedScore > 0 ? `${displayScore} (${accumulatedScore})` : displayScore;
    }

    if (get('best-score-stat')) get('best-score-stat').textContent = `${lastBestScore.score} stain / ${lastBestScore.time}s`;
    if (get('prev-score-stat')) get('prev-score-stat').textContent = `${lastPrevScore.score} stain / ${lastPrevScore.time}s`;

    // Sidebar Stats Sync
    if (get('side-best-score')) get('side-best-score').textContent = lastBestScore.score;
    if (get('side-prev-score')) get('side-prev-score').textContent = lastPrevScore.score;

    // Updates for new Sidebar Stats
    if (get('time-val')) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        get('time-val').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
    if (get('spawn-val')) {
        const interval = getSpawnInterval();
        get('spawn-val').textContent = (interval / 1000).toFixed(2) + 's';
    }

    const updateSkinBtn = (btnId, skinName) => {
        const btn = get(btnId);
        if (!btn) return;
        if (skinName === 'default' || ownedSkins.includes(skinName)) {
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
            const price = skinName === 'rainbow' ? 3000 : 1000;
            btn.textContent = `${price} 🪙`;
            btn.disabled = coins < price;
            btn.style.opacity = coins < price ? "0.5" : "1";
        }
    };

    updateSkinBtn('buy-skin-default', 'default');

    updateSkinBtn('buy-skin-fire', 'fire');
    updateSkinBtn('buy-skin-ice', 'ice');
    updateSkinBtn('buy-skin-electric', 'electric');
    updateSkinBtn('buy-skin-rainbow', 'rainbow');

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
            total_coins INTEGER DEFAULT 0,
            survival_time INTEGER DEFAULT 0,
            best_score INTEGER DEFAULT 0,
            best_survival_time INTEGER DEFAULT 0,
            total_survival_time INTEGER DEFAULT 0,
            last_active TIMESTAMP DEFAULT NOW(),
            created_at TIMESTAMP DEFAULT NOW(),
            is_vip BOOLEAN DEFAULT FALSE
        )`;

        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_score INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS best_survival_time INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_survival_time INTEGER DEFAULT 0`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP DEFAULT NOW()`;

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

        await sql`CREATE TABLE IF NOT EXISTS global_events (
            event_type TEXT PRIMARY KEY,
            event_value TEXT,
            expires_at TIMESTAMP
        )`;
    } catch (e) { console.error("DB Init Error", e); }
}

async function syncUserData(isFinal = false) {
    if (!userEmail) return;
    try {
        const currentSurvival = Math.floor((Date.now() - startTime) / 1000);
        const totalScoreToSync = Math.floor(score + accumulatedScore);

        // Update user profile with latest stats
        await sql`UPDATE users SET 
            score = ${totalScoreToSync},
            coins = ${coins},
            survival_time = ${currentSurvival},
            best_score = GREATEST(best_score, ${totalScoreToSync}),
            best_survival_time = GREATEST(best_survival_time, ${currentSurvival}),
            total_survival_time = total_survival_time + (CASE WHEN last_active > NOW() - INTERVAL '30 seconds' THEN EXTRACT(EPOCH FROM (NOW() - last_active)) ELSE 0 END),
            last_active = NOW()
            WHERE email = ${userEmail}`;

        // If game is over, record this achievement in history and update total_coins
        if (isFinal) {
            const finalScore = totalScoreToSync;
            const subSessionScore = Math.floor(score);
            const earned = Math.floor((Math.floor(subSessionScore * 0.5) + Math.floor(currentSurvival * 0.2)) * (coinBonusMultiplier || 1.0));

            console.log("📊 Attempting to record match achievement...", { email: userEmail, score: finalScore, earned });

            await sql`INSERT INTO game_results (user_email, score, duration_seconds, coins_earned, played_at)
                     VALUES (${userEmail}, ${finalScore}, ${currentSurvival}, ${earned}, NOW())`;

            await sql`UPDATE users SET total_coins = total_coins + ${earned} WHERE email = ${userEmail}`;
            console.log("✅ Match achievement recorded successfully.");
        }
    } catch (e) { console.error("Sync Error:", e); }
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
        const countRes = await sql`SELECT COUNT(*) as count FROM users WHERE last_active > NOW() - INTERVAL '2 minutes'`;
        if (get('online-count')) get('online-count').textContent = countRes[0].count;

    } catch (e) {
        console.error("Leaderboard Error:", e);
        if (list) list.innerHTML = '<p style="text-align: center; color: #ff4d4d; font-size: 0.7rem; padding: 10px;">ბაზასთან კავშირი ვერ მოხერხდა</p>';
    }
}



// fetchSharedScores removed

async function fetchGlobalRankings() {
    if (get('ratings-modal').classList.contains('hidden')) return;

    const renderList = (id, data, suffix, statKey) => {
        const list = get(id);
        if (!list) return;
        list.innerHTML = '';
        data.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'mini-lb-item';
            if (u.is_vip) item.classList.add('vip-lb-item');

            const val = u[statKey] || 0;
            const crown = u.is_vip ? '👑 ' : '';
            const nameColor = u.is_vip ? 'color: #ffd700; font-weight: 800;' : '';

            let rankBadge = '';
            if (i < 3) {
                rankBadge = `<span class="top-rank-badge rank-${i + 1}">${i + 1}</span>`;
            } else {
                rankBadge = `<span style="width: 24px; text-align: center; font-size: 0.8rem; opacity: 0.5;">${i + 1}</span>`;
            }

            item.innerHTML = `
                <div class="mini-lb-info">
                    ${rankBadge}
                    <span class="mini-lb-name" style="${nameColor}">${crown}${u.nickname.substring(0, 10)}</span>
                </div>
                <span class="mini-lb-score">${val}${suffix}</span>
            `;
            list.appendChild(item);
        });
    };

    try {
        const topScores = await sql`SELECT nickname, best_score, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY best_score DESC LIMIT 10`;
        renderList('top-scores-list', topScores, '✨', 'best_score');

        const topCoins = await sql`SELECT nickname, coins, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY coins DESC LIMIT 10`;
        renderList('top-coins-list', topCoins, '🪙', 'coins');

        const topTime = await sql`SELECT nickname, total_survival_time, is_vip FROM users WHERE nickname IS NOT NULL AND nickname != '' ORDER BY total_survival_time DESC LIMIT 10`;
        renderList('top-time-list', topTime, 'წმ', 'total_survival_time');
    } catch (e) { console.error("Global Rankings Error:", e); }
}

async function shareScore(scoreVal, timeVal) {
    if (!nickname || scoreVal <= 0) return;

    // Restriction Check: Guests can share
    if (userEmail && userEmail.startsWith('guest_') && !nickname) return;


    try {
        const efficiency = timeVal > 0 ? scoreVal / timeVal : 0;
        console.log("🌍 Attempting to auto-share score to rankings...", { nick: nickname, score: scoreVal });

        await sql`INSERT INTO shared_scores (nickname, score, survival_time, efficiency, is_vip)
                  VALUES (${nickname}, ${scoreVal}, ${timeVal}, ${efficiency}, ${isVip})`;

        console.log("✅ Match automatically shared to global rankings.");
    } catch (e) {
        console.error("❌ Auto-Share Error:", e);
    }
}




// --- Game Logic ---

let globalMultiplier = 1;
let globalRainbowActive = false;
let globalCrisisTime = 30;
let globalSpawnIntervalOverride = null;
let globalBossLimitOverride = null;
let globalStainLimitOverride = null;
let globalStrengthMult = 1;
let globalRadiusMult = 1;
let globalCoinMult = 1;
let globalBossHPOverride = null;
let globalSoapThresholdOverride = null;
let globalMinigameThresholdOverride = null;
let globalSoapCutsceneTimeOverride = null;
let soapUseCount = 0;
let globalGodMode = false;
let globalFreezeEnemies = false;
let globalBossImage = null;
let globalBossScale = 1.0;
let globalUpgradeFactor = 1.3;

// Video Notification Globals
let videoChannels = [{ id: 'UCycgfC-1XTtOeMLr5Vz77dg', weight: 100 }];
let allChannelVideos = {}; // { channelId: [videos] }
let last10Videos = [];
let videoPopupTimers = [];
let videoTimings = [10, 30, 60, 300];
let videoLoopInterval = 300;
let globalForcedVideo = null; // {id, title, thumb, link}

function updateScore(points) {
    if (!gameActive) return;
    if (points > 0) {
        // Apply Global Multiplier
        const finalPoints = points * globalMultiplier;

        const newScore = score + finalPoints;

        // 🛡️ Security: Validate score before updating
        if (window.securitySystem && !window.securitySystem.validateScore(newScore)) {
            console.warn('🚨 Invalid score detected, rejecting update');
            return;
        }

        score = newScore;
        totalStainsCleaned += finalPoints;

        // Queue all earned upgrades
        const safeFactor = Math.max(1.05, globalUpgradeFactor || 1.3);
        while (score >= nextUpgradeScore && pendingUpgrades < 10) { // Limit pending to 10 for safety
            pendingUpgrades++;
            nextUpgradeScore = Math.ceil(nextUpgradeScore * safeFactor);
        }

        if (pendingUpgrades > 0 && !isUpgradeOpen && gameActive) {
            showUpgradeOptions();
            syncUserData(true);
        }

        // 1000 score milestone reward
        if (Math.floor(score / 1000) > Math.floor(lastMilestoneScore / 1000)) {
            const addAmt = (1 * globalCoinMult);
            coins += addAmt;
            sessionCoinsEarned += addAmt;
            showStatusUpdate('+1 ქოინი ბონუსი! 🪙');
            lastMilestoneScore = score;
            saveStatsToLocal();
        }

        // Dynamic Soap Milestone
        const soapThresh = globalSoapThresholdOverride || 2500;
        if (Math.floor(score / soapThresh) > Math.floor(lastSoapMilestone / soapThresh)) {
            lastSoapMilestone = score;
            createSoap();
        }

        // Dynamic Minigame Milestone
        const minigameThresh = globalMinigameThresholdOverride || 3750;
        if (Math.floor(score / minigameThresh) > Math.floor(lastMinigameMilestone / minigameThresh)) {
            lastMinigameMilestone = score;
            setTimeout(startMinigame, 500); // Small delay
        }

        // Spin Wheel Milestone (Every 20,000 points)
        if (Math.floor(score / 20000) > Math.floor(lastSpinMilestone / 20000)) {
            lastSpinMilestone = score;
            setTimeout(showSpinWheel, 1000);
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

    const list = get('active-upgrades-list');
    const pinkList = get('pink-bonuses-list');
    if (!list || !pinkList) return;

    // Regular upgrades
    const activeUpgrades = Object.entries(upgradeCounts).filter(([_, count]) => count > 0);
    if (activeUpgrades.length === 0) {
        list.innerHTML = '<p style="font-size: 0.8rem; opacity: 0.5;">ჯერ არ გაქვთ</p>';
    } else {
        list.innerHTML = activeUpgrades.map(([id, count]) => {
            const names = {
                'diff': '⚡ სირთულე',
                'speed': '🚀 რობოტის სიჩქარე',
                'bot': '🤖 რობოტები',
                'radius': '📏 რადიუსი',
                'strength': '💪 ძალა',
                'karcher': '🚿 კერხერი',
                'bomb': '💣 ბომბი',
                'coin_buff': '💰 ქოინები',
                'magnet': '⚡ ლაზერი',
                'bot_pow': '🦾 რობოტის ძალა',
                'spawn_speed': '⏩ სპაუნის აჩქარება',
                'boss_weaken': '💀 ბოსების დასუსტება'
            };
            return `<div class="upgrade-item"><span>${names[id] || id}</span> <strong>×${count}</strong></div>`;
        }).join('');
    }

    // Pink bonuses
    if (pinkBonuses.length === 0) {
        pinkList.innerHTML = '<p style="font-size: 0.8rem; opacity: 0.5;">ჯერ არ გაქვთ</p>';
    } else {
        const counts = {};
        pinkBonuses.forEach(x => { counts[x] = (counts[x] || 0) + 1; });

        pinkList.innerHTML = Object.entries(counts).map(([id, count]) => {
            const names = {
                'speed': '🚀 რობოტის სიჩქარე',
                'bot': '🤖 რობოტის სიჩქარე',
                'radius': '📏 წმენდის რადიუსი',
                'strength': '💪 ტილოს ძალა',
                'karcher': '🚿 კერხერის სიმძლავრე',
                'bomb': '💣 ბომბის სიმძლავრე',
                'coin_buff': '💰 ქოინების ბონუსი',
                'magnet': '⚡ ლაზერის სიმძლავრე',
                'bot_pow': '🦾 რობოტის ძალა',
                'spawn_speed': '⏩ სპაუნის აჩქარება',
                'boss_weaken': '💀 ბოსების დასუსტება'
            };
            return `<div class="upgrade-item pink-bonus-item"><span>${names[id] || id}</span> <strong>+${count * 50}%</strong></div>`;
        }).join('');
    }
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
    if (name === 'default' || ownedSkins.includes(name)) {
        currentSkin = name;
        showStatusUpdate(`${name === 'default' ? 'ჩვეულებრივი' : name} სკინი არჩეულია! ✨`);
    } else {
        const price = name === 'rainbow' ? 3000 : 1000;
        if (coins >= price) {
            coins -= price;
            ownedSkins.push(name);
            currentSkin = name;
            showStatusUpdate(`${name} სკინი შეძენილია! 🔥`);
        } else {
            showStatusUpdate('არ გაქვს საკმარისი ქოინები! ❌');
        }
    }
    updatePowerStats();
    saveStatsToLocal();
    updateUIValues();
    syncUserData();
}

function safeOnClick(id, action) {
    const el = get(id);
    if (el) el.onclick = action;
}

function initUI() {
    safeOnClick('buy-skin-default', () => handleSkinAction('default'));
    safeOnClick('buy-skin-fire', () => handleSkinAction('fire'));
    safeOnClick('buy-skin-ice', () => handleSkinAction('ice'));
    safeOnClick('buy-skin-electric', () => handleSkinAction('electric'));
    safeOnClick('buy-skin-rainbow', () => handleSkinAction('rainbow'));

    // UI Toggle Logic
    const shopAction = () => get('shop-modal').classList.remove('hidden');
    const settingsAction = () => {
        if (userEmail && userEmail.startsWith('guest_')) {
            get('restricted-modal').classList.remove('hidden');
            return;
        }
        get('settings-modal').classList.remove('hidden');
        get('settings-user-name').textContent = nickname || 'სტუმარი';
        get('settings-user-email').textContent = userEmail && !userEmail.startsWith('guest_') ? userEmail : 'სტუმრის ანგარიში';
    };
    const themesAction = () => get('themes-modal').classList.remove('hidden');
    const ratingsAction = () => {
        if (get('ratings-modal')) {
            get('ratings-modal').classList.remove('hidden');
            fetchGlobalRankings();
        }
    };
    const uiAction = () => get('ui-modal').classList.remove('hidden');

    safeOnClick('shop-btn', shopAction);
    safeOnClick('shop-btn-side', shopAction);

    safeOnClick('settings-btn', settingsAction);
    safeOnClick('settings-btn-side', settingsAction);

    safeOnClick('themes-btn', themesAction);
    safeOnClick('themes-btn-side', themesAction);

    safeOnClick('ratings-btn', ratingsAction);
    safeOnClick('ratings-btn-side', ratingsAction);

    safeOnClick('ui-toggle-btn', uiAction);
    safeOnClick('ui-toggle-btn-side', uiAction);

    safeOnClick('close-ui', () => get('ui-modal').classList.add('hidden'));
    safeOnClick('close-shop', () => get('shop-modal').classList.add('hidden'));
    safeOnClick('close-settings', () => get('settings-modal').classList.add('hidden'));
    safeOnClick('close-themes', () => get('themes-modal').classList.add('hidden'));
    safeOnClick('close-ratings', () => get('ratings-modal').classList.add('hidden'));

    // Premium Sidebar Logic
    const statsSidebar = get('stats-sidebar');
    const menuSidebar = get('menu-sidebar');

    if (get('stats-side-toggle')) get('stats-side-toggle').onclick = () => statsSidebar && statsSidebar.classList.toggle('side-collapsed');
    if (get('stats-close-btn')) get('stats-close-btn').onclick = () => statsSidebar && statsSidebar.classList.add('side-collapsed');

    if (get('menu-side-toggle')) get('menu-side-toggle').onclick = () => menuSidebar && menuSidebar.classList.toggle('side-collapsed');
    if (get('menu-close-btn')) get('menu-close-btn').onclick = () => menuSidebar && menuSidebar.classList.add('side-collapsed');

    // Chat Modal Logic
    const chatModal = get('chat-modal');
    const openChat = () => {
        chatModal.classList.remove('hidden');
        gameActive = false;
        showStatusUpdate(' ჩატი გახსნილია - თამაში დაპაუზებულია ⏸️');
    };
    const closeChat = () => {
        chatModal.classList.add('hidden');
        gameActive = true;
        scheduleNextStain();
        showStatusUpdate('თამაში გაგრძელდა ▶️');
    };

    safeOnClick('chat-modal-btn', openChat);
    safeOnClick('close-chat-modal', closeChat);

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
    const endBtn = get('end-game-btn');
    if (endBtn) {
        endBtn.onclick = () => {
            if (confirm("ნამდვილად გსურთ თამაშის დასრულება? შედეგი ავტომატურად შეინახება.")) {
                gameOver();
            }
        };
    }

    // Restart Logic
    const handleRestart = () => {
        if (userEmail && !userEmail.startsWith('guest_')) {
            startGameSession();
            get('defeat-modal').classList.add('hidden');
            document.querySelectorAll('.stain').forEach(s => s.remove());
        } else {
            location.reload();
        }
    };
    if (get('restart-game-btn')) get('restart-game-btn').onclick = handleRestart;

    // Logout Logic
    if (get('logout-btn')) {
        get('logout-btn').onclick = () => {
            localStorage.clear();
            location.reload();
        };
    }

    // --- Profile Management Listeners ---

    // Profile listeners
    safeOnClick('update-profile-btn', async () => {
        const newNick = get('edit-nick') ? get('edit-nick').value.trim() : '';
        const newEmail = get('edit-email') ? get('edit-email').value.trim() : '';

        if (!newNick && !newEmail) {
            alert('შეიყვანეთ ახალი მონაცემები!');
            return;
        }

        try {
            if (newNick) {
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
            if (get('settings-user-name')) get('settings-user-name').textContent = nickname;
            if (get('settings-user-email')) get('settings-user-email').textContent = userEmail;
            if (get('edit-nick')) get('edit-nick').value = '';
            if (get('edit-email')) get('edit-email').value = '';
        } catch (e) {
            console.error(e);
            alert('შეცდომა განახლებისას');
        }
    });

    safeOnClick('update-pass-btn', async () => {
        const newPass = get('edit-pass') ? get('edit-pass').value.trim() : '';
        if (!newPass) {
            alert('შეიყვანეთ ახალი პაროლი!');
            return;
        }

        try {
            await sql`UPDATE users SET password = ${newPass} WHERE email = ${userEmail}`;
            showStatusUpdate('პაროლი შეიცვალა! 🔑');
            if (get('edit-pass')) get('edit-pass').value = '';
        } catch (e) {
            console.error(e);
            alert('შეცდომა პაროლის შეცვლისას');
        }
    });

    // Forgot Password Flow
    if (get('forgot-pass-btn')) {
        get('forgot-pass-btn').onclick = (e) => {
            e.preventDefault();
            get('reset-form').classList.toggle('hidden');
        };
    }

    if (get('request-reset-btn')) {
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
    }

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


    // Revive Button
    safeOnClick('revive-btn', () => reviveGame());

    const loadUIState = () => {
        const uiState = JSON.parse(localStorage.getItem('tilo_ui_state')) || { stats: true, chat: true };
        get('toggle-stats').checked = uiState.stats;
        get('toggle-chat').checked = uiState.chat;

        const statsEl = document.querySelector('.user-stats');
        if (statsEl) statsEl.style.display = uiState.stats ? 'flex' : 'none';

        const chat = get('global-chat');
        if (chat) chat.style.display = uiState.chat ? 'flex' : 'none';
    };

    if (get('toggle-stats')) {
        get('toggle-stats').onchange = (e) => {
            const show = e.target.checked;
            const statsEl = document.querySelector('.user-stats');
            if (statsEl) statsEl.style.display = show ? 'flex' : 'none';
            saveUIState();
        };
    }

    if (get('toggle-chat')) {
        get('toggle-chat').onchange = (e) => {
            const show = e.target.checked;
            const chat = get('global-chat');
            if (chat) chat.style.display = show ? 'flex' : 'none';
            saveUIState();
        };
    }

    const saveUIState = () => {
        const statsToggle = get('toggle-stats');
        const lbToggle = get('toggle-lb');
        const chatToggle = get('toggle-chat');
        const state = {
            stats: statsToggle ? statsToggle.checked : true,
            lb: lbToggle ? lbToggle.checked : true,
            chat: chatToggle ? chatToggle.checked : true
        };
        localStorage.setItem('tilo_ui_state', JSON.stringify(state));
    };

    // Initialize UI State
    loadUIState();

    // Theme selection logic
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
            // Send to chat
            await sql`INSERT INTO chat_messages(nickname, message) VALUES('📢 SYSTEM', ${msg})`;

            // Trigger global system alert for everyone
            await sql`INSERT INTO global_events (event_type, event_value, expires_at)
                      VALUES ('info', ${msg}, NOW() + INTERVAL '1 minute')
                      ON CONFLICT (event_type) DO UPDATE 
                      SET event_value = EXCLUDED.event_value, expires_at = EXCLUDED.expires_at`;

            document.getElementById('admin-broadcast-msg').value = '';
            setStatus("Broadcast sent (Chat & Screen)");
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
    const chatInput = get('chat-input');
    const sendBtn = get('send-chat-btn');

    async function sendMsg() {
        const text = chatInput.value.trim().substring(0, 50);
        if (!text || !nickname) return;
        try {
            await sql`INSERT INTO chat_messages(nickname, message) VALUES(${nickname}, ${text})`;
            chatInput.value = '';
            fetchChat();
        } catch (e) { }
    }
    if (sendBtn) sendBtn.onclick = sendMsg;
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
    setInterval(fetchChat, 3000);
}

async function fetchChat() {
    try {
        const msgs = await sql`
            SELECT DISTINCT ON (cm.id) cm.*, u.is_vip
            FROM chat_messages cm
            LEFT JOIN users u ON cm.nickname = u.nickname
            WHERE cm.created_at > NOW() - INTERVAL '30 seconds'
              AND cm.nickname != 'SYSTEM_LOG'
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
                        h -= (80 * helperCleaningMultiplier); // Dynamic robot cleaning power
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
}

function startLaserLoop() {
    if (!hasMagnetUpgrade) return;

    if (gameActive) {
        triggerLaser();
    }
    setTimeout(startLaserLoop, magnetInterval);
}

function triggerLaser() {
    const stains = document.querySelectorAll('.stain');
    if (stains.length > 0) {
        const hitCount = upgradeCounts['magnet'] || 1;
        const targets = Array.from(stains).slice(0, hitCount);

        targets.forEach(target => {
            const rect = target.getBoundingClientRect();
            createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, '#4facfe', 10);
            // Laser Lightning Effect
            if (currentX && currentY) {
                createLightning(currentX, currentY, rect.left + rect.width / 2, rect.top + rect.height / 2);
            }
            let h = parseFloat(target.dataset.health);
            const dmg = 200 * (upgradeCounts['magnet'] || 1);
            target.dataset.health = h - dmg;
            if (h <= dmg) target.dataset.health = 0;
            checkCleaning(rect.left + rect.width / 2, rect.top + rect.height / 2);
        });
    }
}

function applyUpgrade(id) {
    if (id === 'coin_buff') {
        consecutiveCoinBuffs++;
    } else {
        consecutiveCoinBuffs = 0;
    }

    switch (id) {
        // case 'diff' removed
        case 'speed': helperSpeedMultiplier *= globalUpgradePower; break;
        case 'bot': startHelperBot(); break;
        case 'radius': radiusMultiplier *= globalUpgradePower; updatePowerStats(); break;
        case 'strength': strengthMultiplier *= globalUpgradePower; updatePowerStats(); break;
        case 'karcher': strengthMultiplier *= (globalUpgradePower * 0.7 + 1); radiusMultiplier *= (globalUpgradePower * 0.7 + 1); updatePowerStats(); break;
        case 'bomb': hasBombUpgrade = true; break;
        case 'coin_buff': coinBonusMultiplier += (globalUpgradePower - 1); break;
        case 'bot_pow': helperCleaningMultiplier *= globalUpgradePower; break;
        case 'magnet':
            if (!hasMagnetUpgrade) {
                hasMagnetUpgrade = true;
                startLaserLoop();
            }
            break;
        case 'spawn_speed': spawnSpeedUpgradeMultiplier *= 0.8; break;
        case 'boss_weaken': bossWeaknessMultiplier *= 0.9; break;
    }
    updateUIValues();
    updateStatsSidebar();

    pendingUpgrades--;
    if (pendingUpgrades > 0) {
        showUpgradeOptions();
    } else {
        get('upgrade-modal').classList.add('hidden');
        isUpgradeOpen = false;
        gameActive = true;
        scheduleNextStain();
    }
}

// --- Pink Soap Special Mechanic ---


let soapTimer = null;
let soapWarningTimer = null;

function createSoap() {
    if (isSoapActive || isUpgradeOpen) return; // Don't spawn soap if choosing upgrade
    const container = get('canvas-container');
    if (!container) return;

    isSoapActive = true;

    const soap = document.createElement('div');
    soap.className = 'soap-stain';
    soap.id = 'active-soap';
    soap.innerHTML = '🧼';
    // Spawn more towards the center (30% to 70% range)
    const spawnX = (window.innerWidth * 0.3) + (Math.random() * window.innerWidth * 0.4);
    const spawnY = (window.innerHeight * 0.3) + (Math.random() * window.innerHeight * 0.4);
    soap.style.left = `${spawnX - 60}px`;
    soap.style.top = `${spawnY - 40}px`;

    // 30 Seconds Disappear Logic
    if (soapTimer) clearTimeout(soapTimer);
    if (soapWarningTimer) clearTimeout(soapWarningTimer);

    // Warning at 20s
    soapWarningTimer = setTimeout(() => {
        const s = get('active-soap');
        if (s) {
            // Apply a flashing red border/shadow animation
            s.style.transition = '0.5s';
            s.style.boxShadow = '0 0 20px red';
            s.style.border = '2px solid red';
            showStatusUpdate('საპონი მალე გაქრება! 🕒⚠️');

            // Pulse animation manually if CSS keyframes aren't reliable
            let toggle = false;
            const pulseInt = setInterval(() => {
                if (!get('active-soap')) { clearInterval(pulseInt); return; }
                toggle = !toggle;
                s.style.transform = toggle ? 'scale(1.1)' : 'scale(1.0)';
            }, 500);
        }
    }, 20000);

    // Disappear at 30s
    soapTimer = setTimeout(() => {
        const s = get('active-soap');
        if (s) {
            s.remove();
            isSoapActive = false;
            showStatusUpdate('საპონი გაქრა... 😞🧼');
        }
    }, 30000);

    soapClickCount = 0;
    soap.onclick = (e) => {
        e.stopPropagation();
        soapClickCount++;
        createBubbles(e.clientX, e.clientY, 15);

        // Visual feedback
        soap.style.transform = `scale(${1.2 + (soapClickCount * 0.1)})`;

        if (soapClickCount >= 10) {
            burstSoap(e.clientX, e.clientY);
        }
    };

    soap.onmouseenter = () => {
        // Only override if not in warning mode
        if (!get('active-soap').style.border) {
            showStatusUpdate('დააკლიკე 10-ჯერ საპონს! 🧼⚡');
            soap.style.boxShadow = '0 0 50px #ff69b4, inset 0 0 30px white';
        }
    };

    soap.onmouseleave = () => {
        if (!get('active-soap').style.border) {
            soap.style.boxShadow = '';
        }
    };

    container.appendChild(soap);
    showStatusUpdate('საპონი გამოჩნდა! მიიტანე ტილო და დააკლიკე! (30წმ) 🧼✨');
}

function createBubbles(x, y, count, isPink = false) {
    const container = document.body;
    for (let i = 0; i < count; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble-particle';

        // Larger sizes for cinematic effect
        const minSize = isPink ? 30 : 10;
        const maxSize = isPink ? 80 : 30;
        const size = Math.random() * (maxSize - minSize) + minSize;

        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.left = `${x}px`;
        bubble.style.top = `${y}px`;

        if (isPink) {
            bubble.style.background = 'radial-gradient(circle at 30% 30%, #ffc0cb, #ff69b4)';
            bubble.style.border = '2px solid rgba(255, 255, 255, 0.8)';
            bubble.style.boxShadow = '0 0 20px rgba(255, 105, 180, 0.5)';
        }

        const tx = (Math.random() - 0.5) * 400; // Increased spread
        const ty = (Math.random() - 0.5) * 400;
        bubble.style.setProperty('--tx', `${tx}px`);
        bubble.style.setProperty('--ty', `${ty}px`);

        container.appendChild(bubble);
        setTimeout(() => bubble.remove(), 1000);
    }
}

function burstSoap(x, y) {
    if (soapTimer) clearTimeout(soapTimer);
    soapUseCount++;
    if (soapWarningTimer) clearTimeout(soapWarningTimer);

    const soap = get('active-soap');
    if (soap) soap.remove();
    isSoapActive = false;

    // Initial massive pink burst
    createBubbles(x, y, 100, true);

    // Clear the screen and award points
    let burstPoints = 0;
    document.querySelectorAll('.stain').forEach(s => {
        if (s.dataset.cleaning === 'true') return;
        s.dataset.cleaning = 'true';

        const isBoss = s.classList.contains('boss-stain');
        const isTriangle = s.classList.contains('triangle-boss');
        const rMult = parseFloat(s.dataset.rewardMult || 1.0);

        if (isTriangle) {
            burstPoints += Math.floor(20 * rMult);
            bossesDefeated++;
        } else if (isBoss) {
            burstPoints += Math.floor(10 * rMult);
            bossesDefeated++;
        } else {
            burstPoints += 1;
            totalStainsCleanedRel++;
        }
        s.remove();
    });

    if (burstPoints > 0) updateScore(burstPoints);
    bossCount = 0;

    gameActive = false; // Pause AFTER awarding points
    showStatusUpdate(`ეკრანი გასუფთავდა! (+${burstPoints} ქულა) 🌸✨`);

    // "Cutscene" - Intense bubble wave for 3 seconds
    let startTime = Date.now();
    let waveInterval = setInterval(() => {
        // Mix of small white and large pink bubbles
        createBubbles(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 10, false);
        createBubbles(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 5, true);

        let cutTime = 3000;
        if (soapUseCount >= 5) cutTime = 1500;
        if (globalSoapCutsceneTimeOverride !== null) cutTime = globalSoapCutsceneTimeOverride;

        if (Date.now() - startTime >= cutTime) {
            clearInterval(waveInterval);
            showStatusUpdate('აირჩიე სუპერ-ბონუსი! 🌸');
            showPinkUpgradeOptions();
        }
    }, 100);
}

function showPinkUpgradeOptions() {
    const modal = get('pink-upgrade-modal');
    const container = get('pink-upgrade-container');
    container.innerHTML = '';
    modal.classList.remove('hidden');

    const names = {
        'speed': 'რობოტის სიჩქარე',
        'radius': 'წმენდის რადიუსი',
        'strength': 'ტილოს ძალა',
        'karcher': 'კერხერის სიმძლავრე',
        'bomb': 'ბომბის სიმძლავრე',
        'coin_buff': 'ქოინების ბონუსი',
        'magnet': 'ლაზერის სიმძლავრე',
        'bot_pow': 'რობოტის ძალა',
        'spawn_speed': 'სპაუნის აჩქარება',
        'boss_weaken': 'ბოსების დასუსტება'
    };

    const icons = {
        'speed': '🚀', 'radius': '📏',
        'strength': '💪', 'karcher': '🚿', 'bomb': '💣', 'coin_buff': '💰', 'magnet': '⚡', 'bot_pow': '🦾',
        'spawn_speed': '⏩', 'boss_weaken': '💀'
    };

    // Filter upgrades player already has at least one of (Excluding 'diff', 'bot', and 'spawn_speed')
    const excludes = ['diff', 'bot', 'spawn_speed'];
    const ownedIds = Object.keys(upgradeCounts).filter(id => !excludes.includes(id) && upgradeCounts[id] > 0);

    // If none owned, offer fallback
    const availablePool = ownedIds.length >= 3 ? ownedIds : Object.keys(upgradeCounts).filter(id => !excludes.includes(id));

    const shuffled = [...availablePool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    selected.forEach(id => {
        const card = document.createElement('div');
        card.className = 'upgrade-card pink-upgrade-card';
        const percent = Math.round((globalPinkUpgradePower - 1) * 100);
        card.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 10px;">${icons[id] || '✨'}</div>
            <h3>+${percent}% ${names[id] || id}</h3>
            <p>თქვენი არსებული ${names[id]} გაძლიერდება!</p>
        `;
        card.onclick = () => applyPinkUpgrade(id);
        container.appendChild(card);
    });
}

function applyPinkUpgrade(id) {
    get('pink-upgrade-modal').classList.add('hidden');

    // Track the bonus
    // Allow stacking
    pinkBonuses.push(id);

    // Apply boost to the benefit
    switch (id) {
        case 'diff': intervalMultiplier *= (1 / globalPinkUpgradePower); break;
        case 'speed': helperSpeedMultiplier *= globalPinkUpgradePower; break;
        case 'bot': helperSpeedMultiplier *= globalPinkUpgradePower; break; // Boost robots overall
        case 'radius': radiusMultiplier *= globalPinkUpgradePower; break;
        case 'strength': strengthMultiplier *= globalPinkUpgradePower; break;
        case 'karcher': strengthMultiplier *= globalPinkUpgradePower; radiusMultiplier *= globalPinkUpgradePower; break;
        case 'bomb': strengthMultiplier *= globalPinkUpgradePower; break;
        case 'coin_buff': coinBonusMultiplier *= globalPinkUpgradePower; break;
        case 'magnet': magnetInterval *= (1 / globalPinkUpgradePower); break;
        case 'bot_pow': helperCleaningMultiplier *= globalPinkUpgradePower; break;
        case 'spawn_speed': spawnSpeedUpgradeMultiplier *= 0.8; break;
        case 'boss_weaken': bossWeaknessMultiplier *= 0.9; break;
    }

    updatePowerStats();
    updateUIValues();
    updateStatsSidebar();
    gameActive = true;
    scheduleNextStain();
    showStatusUpdate('სუპერ-გაძლიერება მიღებულია! 💪⚡');
}

function showUpgradeOptions() {
    isUpgradeOpen = true;
    gameActive = false; // Pause while choosing
    get('upgrade-modal').classList.remove('hidden');

    const UPGRADE_POOL = [
        // 'diff' removed
        { id: 'speed', icon: '🤖', title: 'რობოტის სიჩქარე', desc: '+30% სისწრაფე', type: 'multi' },
        { id: 'bot', icon: '🤖', title: 'რობოტი', desc: '+1 რობოტი', type: 'multi' },
        { id: 'radius', icon: '📏', title: 'რადიუსი', desc: '+30% რადიუსი (Max 10)', type: 'multi' },
        { id: 'strength', icon: '💪', title: 'ტილოს ძალა', desc: '+30% ძალა (Max 10)', type: 'multi' },
        { id: 'karcher', icon: '🚿', title: 'კერხერი', desc: 'ორმაგი ძალა და რადიუსი (X2)', type: 'once' },
        { id: 'bomb', icon: '💣', title: 'ბომბი', desc: 'აფეთქების რადიუსი და ძალა (Max 5)', type: 'multi' },
        { id: 'coin_buff', icon: '💰', title: 'ქოინების ბონუსი', desc: '+30% ქოინების მოგება (Max 5)', type: 'multi' },
        { id: 'magnet', icon: '⚡', title: 'ლაზერი', desc: 'ავტომატური წმენდა მრავალ ლაქაზე (Max 5)', type: 'multi' },
        { id: 'bot_pow', icon: '🦾', title: 'რობოტის ძალა', desc: '+30% რობოტის ძალა (Max 10)', type: 'multi' },
        { id: 'spawn_speed', icon: '⏩', title: 'სპაუნის აჩქარება', desc: '+20% აჩქარება', type: 'multi' },
        { id: 'boss_weaken', icon: '💀', title: 'ბოსების დასუსტება', desc: '-10% ბოსების HP (Max 10)', type: 'multi' }
    ];

    // Filter available upgrades based on limits
    const available = UPGRADE_POOL.filter(u => {
        // 'diff' logic removed
        if (u.id === 'karcher') return (upgradeCounts[u.id] || 0) < 1;
        if (u.id === 'bomb' || u.id === 'magnet') return (upgradeCounts[u.id] || 0) < 5;
        if (u.id === 'bot') return (upgradeCounts[u.id] || 0) < 10;

        const currentSpdVal = (1000 - (score * 0.5)) * spawnSpeedUpgradeMultiplier;

        // Use 10 for basic stats
        if (u.id === 'radius' || u.id === 'strength' || u.id === 'bot_pow' || u.id === 'boss_weaken') {
            if (u.id === 'bot_pow' && activeHelpers < 5) return false;

            // Boss Weaken only appears when 0.1s limit is reached
            if (u.id === 'boss_weaken') {
                if (currentSpdVal > 105) return false;
            }
            return (upgradeCounts[u.id] || 0) < 10;
        }

        // Spawn Speed only appears if not at 0.1s limit
        if (u.id === 'spawn_speed') {
            if (currentSpdVal <= 100.1) return false;
            return (upgradeCounts[u.id] || 0) < 10;
        }

        // Strict limit of 5 per repeatable upgrade (for others like coin_buff, speed)
        return (upgradeCounts[u.id] || 0) < 5;
    });

    // Probability Logic:
    let finalPool = [];
    available.forEach(u => {
        let weight = 1.0;

        // 1. Greed's Curse: If 2+ consecutive coin buffs, offensive items become very rare
        if (consecutiveCoinBuffs >= 2 && (u.id === 'strength' || u.id === 'radius' || u.id === 'bomb' || u.id === 'magnet')) {
            weight *= 0.2;
        }

        // 2. Quality over Quantity: If > 5 bots but low power, new bots become rare
        if (u.id === 'bot' && activeHelpers > 5 && (upgradeCounts['bot_pow'] || 0) < 3) {
            weight = 0.05;
        }

        // 3. Pity System: If score > 5000 and no Elite upgrades, boost their chance
        if ((u.id === 'karcher' || u.id === 'bomb') && score > 5000 && (upgradeCounts['karcher'] || 0) === 0 && (upgradeCounts['bomb'] || 0) === 0) {
            weight = 10.0;
        }

        // 4. Glass Cannon: If Strength >= 8 but Radius <= 3, boost Bomb chance
        if (u.id === 'bomb' && (upgradeCounts['strength'] || 0) >= 8 && (upgradeCounts['radius'] || 0) <= 3) {
            weight *= 3.0;
        }

        // 5. Panic Button: If too many stains (> 15), boost emergency tools (Bomb/Laser)
        const stainCount = document.querySelectorAll('.stain').length;
        if (stainCount > 15 && (u.id === 'bomb' || u.id === 'magnet')) {
            weight *= 1.5;
        }

        // 6. Speed Demon: If Spawn Speed < 0.3s, boost Robot Speed
        const currentSpdVal = (1000 - (score * 0.5)) * spawnSpeedUpgradeMultiplier;
        if (currentSpdVal < 300 && u.id === 'speed') {
            weight *= 1.5;
        }

        // 7. Lonely Warrior: If 5 mins passed and 0 bots, boost Cloth Strength
        const elapsedMin = (Date.now() - startTime) / 60000;
        if (elapsedMin > 5 && activeHelpers === 0 && u.id === 'strength') {
            weight *= 2.0;
        }

        // Existing Logic: Spawn Speed vs Strength
        if (u.id === 'strength' && (upgradeCounts['spawn_speed'] || 0) > (upgradeCounts['strength'] || 0)) {
            weight *= 0.8; // Reduced by 20%
        }

        if (Math.random() < weight) {
            finalPool.push(u);
        }
    });

    // Fallback and Safety Check
    if (finalPool.length === 0 && available.length > 0) finalPool = available;

    // If no upgrades available, close and return
    if (finalPool.length === 0) {
        get('upgrade-modal').classList.add('hidden');
        isUpgradeOpen = false;
        gameActive = true;
        scheduleNextStain();
        return;
    }

    const shuffled = finalPool.sort(() => 0.5 - Math.random());
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

function createLightning(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const bolt = document.createElement('div');
    bolt.className = 'lightning-bolt';
    bolt.style.width = `${dist}px`;
    bolt.style.left = `${x1}px`;
    bolt.style.top = `${y1}px`;
    bolt.style.transform = `rotate(${angle}deg)`;
    document.body.appendChild(bolt);
    setTimeout(() => {
        bolt.style.opacity = '0';
        setTimeout(() => bolt.remove(), 200);
    }, 100);
}

function createFireExplosion(x, y) {
    const explo = document.createElement('div');
    explo.className = 'bomb-explosion';
    const bombLvl = upgradeCounts['bomb'] || 1;
    const size = 150 * (1 + (bombLvl * 0.2));
    explo.style.width = `${size}px`;
    explo.style.height = `${size}px`;
    explo.style.left = `${x - size / 2}px`;
    explo.style.top = `${y - size / 2}px`;
    document.body.appendChild(explo);
    setTimeout(() => explo.remove(), 500);
}

function spawnSkinTrail(x, y) {
    if (!gameActive) return;

    const createTrailPart = (className, offsetX = 0, offsetY = 0) => {
        const t = document.createElement('div');
        t.className = className;
        t.style.left = `${x + offsetX - 15}px`;
        t.style.top = `${y + offsetY - 15}px`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1200);
    };

    switch (currentSkin) {
        case 'fire':
            // 6 lines/streams for fire (Doubled)
            createTrailPart('fire-trail', -20, 0);
            createTrailPart('fire-trail', -10, 5);
            createTrailPart('fire-trail', 0, 0);
            createTrailPart('fire-trail', 0, 10);
            createTrailPart('fire-trail', 10, -5);
            createTrailPart('fire-trail', 20, 0);
            break;
        case 'ice':
            // 6 lines/streams for ice (Doubled)
            createTrailPart('ice-trail', -15, -5);
            createTrailPart('ice-trail', -7, 5);
            createTrailPart('ice-trail', 0, -5);
            createTrailPart('ice-trail', 7, 5);
            createTrailPart('ice-trail', 15, -5);
            createTrailPart('ice-trail', 0, 15);
            break;
        case 'rainbow':
            // Even more bubbles (Doubled)
            for (let i = 0; i < 4; i++) {
                createTrailPart('rainbow-trail', (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
            }
            break;
        case 'electric':
            // Doubled frequency and amount of zaps
            for (let i = 0; i < 4; i++) {
                createTrailPart('electric-trail', (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
            }
            break;
    }
}


function getSpawnInterval() {
    if (globalSpawnIntervalOverride !== null) return globalSpawnIntervalOverride;

    let baseInterval = 1000 - (score * 0.5);
    baseInterval *= spawnSpeedUpgradeMultiplier;

    baseInterval = Math.max(100, baseInterval);
    return baseInterval * intervalMultiplier;
}

function createStain(isBoss = false, isTriangle = false, healthMultiplier = 1.0) {

    const container = get('canvas-container');
    if (!container || !gameActive) return;

    // Strict limit to prevent crash, but allow more chaos later
    const maxStains = 60 + Math.floor(score / 5000);
    const currentStains = document.querySelectorAll('.stain').length;
    if (currentStains >= Math.min(100, maxStains)) return;

    const stain = document.createElement('div');
    stain.className = 'stain';

    // ==========================================
    // ROGUELIKE SCALING LOGIC 
    // ==========================================

    // Difficulty Factor: Increases by 0.1 every 1000 score
    const difficulty = (1 + (score / 10000));

    let health = 100;
    let size = Math.random() * 100 + 50; // Random size 50-150px

    if (isBoss) {
        stain.classList.add('boss-stain');
        stain.classList.add('pulse-animation');

        // Boss Logic:
        // Base HP: 5000
        // Scaling: Exponential growth but manageable
        // Formula: 5000 * (1 + score/20000)^2
        const bossScaling = Math.pow(1 + (score / 20000), 2);

        let baseBossHP = (globalBossHPOverride || 5000) * bossWeaknessMultiplier;

        if (isTriangle) {
            // ELITE BOSS (Every 20k score)
            baseBossHP = 15000 * bossWeaknessMultiplier; // 3x Normal Boss
            stain.classList.add('triangle-boss');
            stain.innerHTML = '<div class="boss-title" style="color: #ffd700 !important; text-shadow: 0 0 10px gold;">ELITE BOSS</div>';
            size = 350 * (globalTriangleBossScale || 1.0);

            if (globalTriangleBossImage) {
                stain.style.backgroundImage = `url('${globalTriangleBossImage}')`;
                stain.style.backgroundSize = 'cover';
                stain.style.backgroundPosition = 'center';
                stain.innerHTML = '';
            }
            stain.style.opacity = globalTriangleBossOpacity || 1.0;
        } else {
            // NORMAL BOSS (Every 5k score)
            stain.innerHTML = '<div class="boss-title">BOSS</div>';
            size = 250 * globalBossScale;

            if (globalBossImage) {
                stain.style.backgroundImage = `url('${globalBossImage}')`;
                stain.style.backgroundSize = 'cover';
                stain.style.backgroundPosition = 'center';
                stain.innerHTML = ''; // Hide "BOSS" text if custom image
            }
            stain.style.opacity = globalBossOpacity || 1.0;
        }

        health = baseBossHP * bossScaling * difficulty;

        // Critical: Boss HP caps at 10 Million to prevent impossible numbers
        health = Math.min(health, 10000000);

    } else {
        // NORMAL STAIN LOGIC
        // Base HP: 100
        // Scaling: Linear (+1 HP per 100 score)
        // Variety: Random types

        health = (100 + (score / 100)) * difficulty;

        // Random shape and color
        const type = Math.random();
        if (type < 0.2) { // 20% Circle Blue (Fast but weak)
            stain.classList.add('stain-circle');
            stain.style.backgroundColor = 'rgba(0, 102, 255, 0.4)';
            health *= 0.7; // 30% less HP
        } else if (type < 0.4) { // 20% Triangle Yellow (Strong but small)
            stain.classList.add('stain-triangle');
            stain.style.backgroundColor = 'rgba(255, 204, 0, 0.4)';
            health *= 1.5; // 50% more HP
            size *= 0.8;   // Smaller
        } else { // 60% Square (Standard)
            const colors = ['rgba(255, 77, 77, 0.3)', 'rgba(77, 255, 77, 0.3)', 'rgba(155, 77, 255, 0.3)'];
            stain.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    if (healthHalvedActive && !isBoss) health /= 2;

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
    if (globalGodMode) return;
    if (!gameActive) return;
    const totalCount = document.querySelectorAll('.stain').length;
    const bossCountUI = document.querySelectorAll('.boss-stain:not(.triangle-boss)').length;
    const triangleBossCountUI = document.querySelectorAll('.triangle-boss').length;
    const inactiveTime = (Date.now() - lastActivityTime) / 1000;

    // Trigger crisis only if screen is actually dirty AND player is inactive
    const limitStains = globalStainLimitOverride || 50;
    const limitBoss = globalBossLimitOverride || 10;
    const limitElite = globalBossLimitOverride ? Math.ceil(globalBossLimitOverride / 2) : 5;

    const isCrisis = totalCount >= limitStains || inactiveTime > 30 || bossCountUI >= limitBoss || triangleBossCountUI >= limitElite;

    if (isCrisis && !defeatTimer) {
        let timeLeft = globalCrisisTime;
        defeatTimer = setInterval(() => {
            if (!gameActive) { clearInterval(defeatTimer); defeatTimer = null; return; }
            timeLeft--;
            if (timeLeft <= 0) { clearInterval(defeatTimer); gameOver(); }
            else if (timeLeft % 5 === 0) {
                let reason = "ჭუჭყი ბევრია!";
                if (inactiveTime > 30) reason = "არააქტიური ხარ! ⚠️";
                else if (totalCount >= limitStains) reason = "ჭუჭყი ბევრია!";
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

    const totalScore = Math.floor(score + accumulatedScore);
    const subSessionScore = Math.floor(score);

    get('defeat-modal').classList.remove('hidden');
    get('final-stains').textContent = totalScore;
    if (get('final-time')) get('final-time').textContent = survival;

    // Final reward removed as per user request (Only coins earned during process are kept)
    if (get('final-coins')) get('final-coins').textContent = sessionCoinsEarned;


    // Check Best Score (Local)
    if (totalScore > lastBestScore.score) {
        lastBestScore.score = totalScore;
        lastBestScore.time = survival;
        localStorage.setItem('tilo_best_score', JSON.stringify(lastBestScore));
    }

    // Save Last Score as "Prev Score"
    lastPrevScore.score = totalScore;
    lastPrevScore.time = survival;
    localStorage.setItem('tilo_prev_score', JSON.stringify(lastPrevScore));

    saveStatsToLocal();
    syncUserData(true); // Final sync

    // 📊 Auto-share result to global rankings
    shareScore(totalScore, survival);
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

        // Reset sub-session score but keep the total progress
        accumulatedScore += Math.floor(score);
        score = 0;
        nextUpgradeScore = 10;
        lastMilestoneScore = 0;
        lastSoapMilestone = 0;
        lastMinigameMilestone = 0;
        updateUIValues();

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
        spawnSkinTrail(x, y); // Spawn skin-specific trail
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
                    createFireExplosion(sx, sy); // Visual effect
                    const bombLvl = upgradeCounts['bomb'] || 1;
                    const radius = 200 + (bombLvl * 100);
                    const damage = 500 * bombLvl;

                    const allStains = document.querySelectorAll('.stain');
                    allStains.forEach(s => {
                        if (s === stain) return;
                        const sRect = s.getBoundingClientRect();
                        const distS = Math.hypot(sx - (sRect.left + sRect.width / 2), sy - (sRect.top + sRect.height / 2));
                        if (distS < radius) {
                            let sh = parseFloat(s.dataset.health);
                            s.dataset.health = sh - damage;
                            if (sh - damage <= 0) checkCleaning(currentX, currentY); // Trigger cleanup
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

    // Modals are handled in initUI

    // Modal Closers
    const closeAuth = () => {
        get('auth-modal').classList.add('hidden');
        get('auth-modal').classList.remove('auth-open-side');
        document.body.classList.remove('auth-visual-open');
    };
    safeOnClick('close-auth', closeAuth);
    if (get('skip-minigame')) get('skip-minigame').onclick = skipMinigame;
    safeOnClick('close-restricted', () => get('restricted-modal').classList.add('hidden'));
    safeOnClick('not-now-btn', () => get('restricted-modal').classList.add('hidden'));
    safeOnClick('go-to-register-btn', () => {
        if (get('restricted-modal')) get('restricted-modal').classList.add('hidden');
        if (get('auth-modal')) get('auth-modal').classList.remove('hidden');
        switchToRegister();
    });

    // Mode Toggle Logic
    let authMode = 'login';
    const switchToLogin = () => {
        authMode = 'login';
        const title = get('auth-title');
        const nickField = get('nick-field');
        const emailInput = get('auth-email');
        const submitBtn = get('auth-submit-btn');
        const loginToggle = get('show-login-btn');
        const regToggle = get('show-register-btn');
        const errorEl = get('auth-error');
        const resetForm = get('reset-form');

        if (title) title.textContent = "ავტორიზაცია";
        if (nickField) nickField.style.display = 'none';
        if (emailInput) emailInput.placeholder = "ელ-ფოსტა / ნიკნეიმი";
        if (submitBtn) submitBtn.textContent = "შესვლა";
        if (loginToggle) loginToggle.style.background = 'var(--cloth-color)';
        if (regToggle) regToggle.style.background = '';
        if (errorEl) errorEl.textContent = '';
        if (resetForm) resetForm.classList.add('hidden');
    };

    const switchToRegister = () => {
        authMode = 'register';
        const title = get('auth-title');
        const nickField = get('nick-field');
        const emailInput = get('auth-email');
        const submitBtn = get('auth-submit-btn');
        const regToggle = get('show-register-btn');
        const loginToggle = get('show-login-btn');
        const errorEl = get('auth-error');
        const resetForm = get('reset-form');

        if (title) title.textContent = "რეგისტრაცია";
        if (nickField) nickField.style.display = 'block';
        if (emailInput) emailInput.placeholder = "ელ-ფოსტა";
        if (submitBtn) submitBtn.textContent = "რეგისტრაცია";
        if (regToggle) regToggle.style.background = 'var(--cloth-color)';
        if (loginToggle) loginToggle.style.background = '';
        if (errorEl) errorEl.textContent = '';
        if (resetForm) resetForm.classList.add('hidden');
    };

    safeOnClick('show-login-btn', switchToLogin);
    safeOnClick('show-register-btn', switchToRegister);
    safeOnClick('open-auth-btn', () => {
        const isStartScreen = get('game-start-overlay') && !get('game-start-overlay').classList.contains('hidden');
        if (get('auth-modal')) get('auth-modal').classList.remove('hidden');
        if (isStartScreen && get('auth-modal')) {
            get('auth-modal').classList.add('auth-open-side');
            document.body.classList.add('auth-visual-open');
        }
        switchToLogin();
    });

    // Submit Auth
    safeOnClick('auth-submit-btn', async () => {
        const nickEl = get('nickname-input');
        const emailEl = get('auth-email');
        const passEl = get('auth-password');
        const errorEl = get('auth-error');
        if (!nickEl || !emailEl || !passEl || !errorEl) return;

        const nickValue = nickEl.value.trim();
        const identValue = emailEl.value.trim();
        const passValue = passEl.value.trim();

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

            const authModal = get('auth-modal');
            if (authModal) {
                authModal.classList.add('hidden');
                authModal.classList.remove('auth-open-side');
            }
            document.body.classList.remove('auth-visual-open');
            startGameSession(true);
        } catch (e) {
            console.error(e);
            errorEl.textContent = "შეცდომა ბაზასთან!";
        }
    });

    // Guest Play Button
    safeOnClick('play-game-btn', async () => {
        const nickEl = get('player-nick');
        const errorEl = get('start-error');
        if (!nickEl || !errorEl) return;
        const inputNick = nickEl.value.trim();
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
            userEmail = `guest_${sessionID}@tilo.life`;
            const sessionPass = `pass_${sessionID}`;

            await sql`INSERT INTO users(email, password, nickname, coins) VALUES(${userEmail}, ${sessionPass}, ${nickname}, 0)`;
            startGameSession();
        } catch (e) {
            console.error("Login Error", e);
            errorEl.textContent = "შეცდომა! თავიდან სცადეთ.";
        }
    });

    setupChat();
    checkGlobalEvents();
    setInterval(checkGlobalEvents, 10000);
};

async function checkGlobalEvents() {
    try {
        const events = await sql`SELECT * FROM global_events WHERE expires_at > NOW()`;

        const oldRegInt = globalBossInterval;
        const oldTriInt = globalTriangleBossInterval;
        const oldRegOp = globalBossOpacity;
        const oldTriOp = globalTriangleBossOpacity;
        const oldRegScale = globalBossScale;
        const oldTriScale = globalTriangleBossScale;

        // Reset state
        globalMultiplier = 1;
        globalRainbowActive = false;
        globalCrisisTime = 30;
        globalSpawnIntervalOverride = null;
        globalBossLimitOverride = null;
        globalStainLimitOverride = null;
        globalStrengthMult = 1;
        globalRadiusMult = 1;
        globalCoinMult = 1;
        globalBossHPOverride = null;
        globalSoapThresholdOverride = null;
        globalMinigameThresholdOverride = null;
        globalSoapCutsceneTimeOverride = null;
        globalGodMode = false;
        globalFreezeEnemies = false;
        globalBossImage = null;
        globalBossScale = 1.0;
        globalBossOpacity = 1.0;
        globalBossInterval = 60000;
        globalRegularBossThreshold = 500;
        globalTriangleBossHP = 30000;
        globalTriangleBossImage = null;
        globalTriangleBossScale = 1.0;
        globalTriangleBossOpacity = 1.0;
        globalTriangleBossThreshold = 1000;
        globalTriangleBossInterval = 120000;
        globalUpgradePower = 1.3;
        globalPinkUpgradePower = 1.5;
        globalUpgradeFactor = 1.3;
        globalForcedVideo = null;

        document.body.classList.remove('global-rainbow');
        // Clear all site effects before re-applying
        const fxClasses = Array.from(document.body.classList).filter(c => c.startsWith('fx-'));
        if (fxClasses.length > 0) document.body.classList.remove(...fxClasses);

        events.forEach(ev => {
            // Logic parsers for new types
            if (ev.event_type === 'player_strength') { globalStrengthMult = parseFloat(ev.event_value); showStatusUpdate('💪 მოთამაშის ძალა გაძლიერებულია!'); updatePowerStats(); }
            if (ev.event_type === 'player_radius') { globalRadiusMult = parseFloat(ev.event_value); showStatusUpdate('📏 რადიუსი გაზრდილია!'); updatePowerStats(); }
            if (ev.event_type === 'coin_mult') { globalCoinMult = parseFloat(ev.event_value); showStatusUpdate('💰 ქოინების მულტიპლიკატორი!'); }
            if (ev.event_type === 'boss_hp') { globalBossHPOverride = parseInt(ev.event_value); showStatusUpdate('☠️ ბოსების HP შეცვლილია!'); }
            if (ev.event_type === 'soap_thresh') { globalSoapThresholdOverride = parseInt(ev.event_value); showStatusUpdate('🧼 საპნის სიხშირე შეცვლილია!'); }
            if (ev.event_type === 'minigame_thresh') { globalMinigameThresholdOverride = parseInt(ev.event_value); showStatusUpdate('🎮 მინი-თამაშის სიხშირე შეცვლილია!'); }
            if (ev.event_type === 'soap_cutscene') { globalSoapCutsceneTimeOverride = parseInt(ev.event_value); showStatusUpdate(`🧼 საპნის დრო: ${globalSoapCutsceneTimeOverride}ms`); }
            if (ev.event_type === 'god_mode') { globalGodMode = true; showStatusUpdate('🛡️ უკვდავება ჩართულია!'); }
            if (ev.event_type === 'freeze_enemies') { globalFreezeEnemies = true; showStatusUpdate('❄️ მტრები გაყინულია (სპაუნი შეჩერდა)!'); }
            if (ev.event_type === 'site_effect') {
                document.body.classList.add(`fx-${ev.event_value}`);
                showStatusUpdate(`🌐 საიტის ეფექტი: ${ev.event_value.toUpperCase()} ✨`);
            }
            if (ev.event_type === 'reg_boss_img') globalBossImage = ev.event_value;
            if (ev.event_type === 'reg_boss_scale') globalBossScale = parseFloat(ev.event_value);
            if (ev.event_type === 'reg_boss_opacity') globalBossOpacity = parseFloat(ev.event_value) / 10;
            if (ev.event_type === 'reg_boss_hp') globalBossHPOverride = parseInt(ev.event_value);
            if (ev.event_type === 'reg_boss_spawn') globalBossInterval = parseInt(ev.event_value) * 1000;
            if (ev.event_type === 'reg_boss_threshold') globalRegularBossThreshold = parseInt(ev.event_value);

            if (ev.event_type === 'tri_boss_img') globalTriangleBossImage = ev.event_value;
            if (ev.event_type === 'tri_boss_scale') globalTriangleBossScale = parseFloat(ev.event_value);
            if (ev.event_type === 'tri_boss_opacity') globalTriangleBossOpacity = parseFloat(ev.event_value) / 10;
            if (ev.event_type === 'tri_boss_hp') globalTriangleBossHP = parseInt(ev.event_value);
            if (ev.event_type === 'tri_boss_spawn') globalTriangleBossInterval = parseInt(ev.event_value) * 1000;
            if (ev.event_type === 'tri_boss_threshold') globalTriangleBossThreshold = parseInt(ev.event_value);

            if (ev.event_type === 'upgrade_power') {
                globalUpgradePower = parseFloat(ev.event_value) || 1.3;
            }
            if (ev.event_type === 'pink_power') {
                globalPinkUpgradePower = parseFloat(ev.event_value) || 1.5;
            }
            if (ev.event_type === 'spawn_now') {
                if (ev.id > lastSpawnEventId) {
                    lastSpawnEventId = ev.id;
                    if (ev.event_value === 'regular') createStain(true, false, 1.0);
                    if (ev.event_value === 'triangle') createStain(true, true, 1.0);
                }
            }
            if (ev.event_type === 'upgrade_config') {
                globalUpgradeFactor = parseFloat(ev.event_value) || 1.3;
            }
            if (ev.event_type === 'info') {
                showSystemAlert(ev.event_value);
            }
            if (ev.event_type === 'video_channel') {
                videoChannels = [{ id: ev.event_value, weight: 100 }];
                fetchYouTubeVideos();
            }
            if (ev.event_type === 'video_config') {
                try {
                    const config = JSON.parse(ev.event_value);
                    if (Array.isArray(config)) {
                        videoChannels = config;
                        fetchYouTubeVideos();
                    }
                } catch (e) { console.error("Video config parse error", e); }
            }
            if (ev.event_type === 'video_timings') { videoTimings = ev.event_value.split(',').map(Number); startVideoScheduler(); }
            if (ev.event_type === 'video_loop') { videoLoopInterval = parseInt(ev.event_value); startVideoScheduler(); }
            if (ev.event_type === 'forced_video') {
                try { globalForcedVideo = JSON.parse(ev.event_value); } catch (e) { }
            }

            if (ev.event_type === 'multiplier') {
                globalMultiplier = parseInt(ev.event_value) || 1;
                showStatusUpdate(`🌍 გლობალური ${globalMultiplier}X ბონუსი აქტიურია! ✨`);
            }
            if (ev.event_type === 'rainbow') {
                globalRainbowActive = true;
                document.body.classList.add('global-rainbow');
                showStatusUpdate(`🌈 გლობალური რეინბოუ ივენთი! ✨`);
            }
            if (ev.event_type === 'crisis_time') {
                globalCrisisTime = parseInt(ev.event_value);
                showStatusUpdate(`⚠️ კრიზისის დრო: ${globalCrisisTime} წამი!`);
            }
            if (ev.event_type === 'spawn_interval') {
                globalSpawnIntervalOverride = parseInt(ev.event_value);
                showStatusUpdate(`⚡ სპაუნის სიჩქარე: ${globalSpawnIntervalOverride}ms!`);
            }
            if (ev.event_type === 'boss_limit') {
                globalBossLimitOverride = parseInt(ev.event_value);
                showStatusUpdate(`☠️ ბოსების ლიმიტი: ${globalBossLimitOverride}!`);
            }
            if (ev.event_type === 'stain_limit') {
                globalStainLimitOverride = parseInt(ev.event_value);
                showStatusUpdate(`🧹 ლაქების ლიმიტი: ${globalStainLimitOverride}!`);
            }
            if (ev.event_type === 'massive_announcement') {
                const remainingSec = Math.floor((new Date(ev.expires_at) - new Date()) / 1000);
                if (remainingSec > 0) {
                    showMassiveAnnouncement(ev.event_value, remainingSec);
                }
            }
        });

        // Restart loops if intervals changed
        if (globalBossInterval !== oldRegInt || globalTriangleBossInterval !== oldTriInt) {
            if (gameActive) resetGameLoops();
        }

        // Apply visual updates to existing bosses if needed
        if (globalBossOpacity !== oldRegOp || globalBossScale !== oldRegScale) {
            document.querySelectorAll('.boss-stain:not(.triangle-boss)').forEach(b => {
                b.style.opacity = globalBossOpacity;
                b.style.width = `${250 * globalBossScale}px`;
                b.style.height = `${250 * globalBossScale}px`;
            });
        }
        if (globalTriangleBossOpacity !== oldTriOp || globalTriangleBossScale !== oldTriScale) {
            document.querySelectorAll('.triangle-boss').forEach(b => {
                b.style.opacity = globalTriangleBossOpacity;
                b.style.width = `${350 * globalTriangleBossScale}px`;
                b.style.height = `${350 * globalTriangleBossScale}px`;
            });
        }

    } catch (e) { console.error("Global Event Check Error", e); }
}


function startGameSession(dontReset = false) {
    if (!dontReset) {
        // Meta-progress (isVip, coins, skins) is kept from global loads
        bossesDefeated = 0;
        totalRepeatablePicked = 0;
        pendingUpgrades = 0;
        accumulatedScore = 0;
        nextUpgradeScore = 10;
        lastMinigameMilestone = 0;
        lastSoapMilestone = 0;
        lastSpinMilestone = 0;
        healthHalvedActive = false;
        pinkBonuses = [];
        upgradeCounts = {
            'diff': 0, 'speed': 0, 'bot': 0, 'radius': 0, 'strength': 0, 'karcher': 0,
            'bomb': 0, 'coin_buff': 0, 'magnet': 0, 'bot_pow': 0
        };

        // Reset Upgrades
        intervalMultiplier = 1.0;
        radiusMultiplier = 1.0;
        strengthMultiplier = 1.0;
        activeHelpers = 0;
        helperSpeedMultiplier = 1.0;
        helperCleaningMultiplier = 1.0;
        hasBombUpgrade = false;
        coinBonusMultiplier = 1.0;
        hasMagnetUpgrade = false;
        lastMilestoneScore = 0;
        document.querySelectorAll('.helper-bot').forEach(b => b.remove());
    }

    score = 0;
    sessionCoinsEarned = 0; // Reset session coins correctly
    nextUpgradeScore = 10; // ALWAYS reset upgrade milestone if score is reset to 0
    totalStainsCleanedRel = 0;
    updatePowerStats();
    showStatusUpdate(`მოგესალმებით, ${nickname}! ✨`);

    // Apply UI
    get('game-start-overlay').classList.add('hidden');
    document.querySelectorAll('.hidden-game-ui').forEach(el => {
        el.classList.remove('hidden-game-ui');
        el.classList.remove('hidden');
    });

    // Reset Side Menus
    if (get('stats-sidebar')) get('stats-sidebar').classList.add('side-collapsed');
    if (get('menu-sidebar')) get('menu-sidebar').classList.add('side-collapsed');

    // Start Loops
    gameActive = true;
    startTime = Date.now();
    lastActivityTime = Date.now();
    scheduleNextStain();

    // Sync loop
    if (syncLoopInterval) clearInterval(syncLoopInterval);
    syncLoopInterval = setInterval(() => { if (userEmail && gameActive) syncUserData(); }, 3000);

    resetGameLoops();

    if (defeatCheckInterval) clearInterval(defeatCheckInterval);
    defeatCheckInterval = setInterval(checkDefeatCondition, 1000);

    // Video Scheduler moved to global init
}

async function fetchYouTubeVideos() {
    // Reset but keep old if fetch fails? Better to just update
    const newAllVideos = {};
    for (const channel of videoChannels) {
        const chId = channel.id;
        if (!chId) continue;
        let rss = `https://www.youtube.com/feeds/videos.xml?user=${chId}`;
        if (chId.startsWith('UC')) {
            rss = `https://www.youtube.com/feeds/videos.xml?channel_id=${chId}`;
        }
        const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;
        try {
            const res = await fetch(api);
            const data = await res.json();
            if (data.status === 'ok') {
                newAllVideos[chId] = data.items;
            } else {
                console.warn('Video Fetch fail for ' + chId, data);
                logToAdmin(`YouTube არხი ვერ მოიძებნა: ${chId}`, 'WARN');
            }
        } catch (e) { console.error('Video fetch error for ' + chId, e); }
    }
    allChannelVideos = newAllVideos;
}

let currentVideoId = '';
let hasWatchedOneVideo = false;

window.hideVideoPopup = function () {
    const popup = get('video-notification');
    if (popup) popup.classList.remove('slide-in');
};

window.watchVideoHere = function (event) {
    if (event) event.preventDefault();
    const modal = get('video-player-modal');
    const iframe = get('video-iframe');

    if (hasWatchedOneVideo) {
        showStatusUpdate('⚠️ უკვე უყურეთ 1 ვიდეოს აქ. გადადით YouTube-ზე.');
        return;
    }

    if (!iframe || !currentVideoId) return;

    iframe.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1`;
    modal.classList.remove('hidden');
    hasWatchedOneVideo = true;

    // Hide notification
    window.hideVideoPopup();
};

window.closeVideoPlayer = function () {
    const modal = get('video-player-modal');
    const iframe = get('video-iframe');
    if (iframe) iframe.src = '';
    if (modal) modal.classList.add('hidden');
};

function showVideoPopup() {
    if (Object.keys(allChannelVideos).length === 0) return;
    // Don't show if modal is open to avoid distraction
    if (get('video-player-modal') && !get('video-player-modal').classList.contains('hidden')) return;

    // Weighted Random Selection of Channel
    const activeChannels = videoChannels.filter(ch => allChannelVideos[ch.id] && allChannelVideos[ch.id].length > 0);
    if (activeChannels.length === 0) return;

    const totalWeight = activeChannels.reduce((sum, ch) => sum + ch.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedChannelId = activeChannels[0].id;

    for (const ch of activeChannels) {
        if (rand < ch.weight) {
            selectedChannelId = ch.id;
            break;
        }
        rand -= ch.weight;
    }

    let vid;
    if (globalForcedVideo) {
        vid = {
            guid: `forced:${globalForcedVideo.id}`,
            title: globalForcedVideo.title || "საინტერესო ვიდეო",
            link: globalForcedVideo.link || `https://www.youtube.com/watch?v=${globalForcedVideo.id}`
        };
    } else {
        const videos = allChannelVideos[selectedChannelId];
        vid = videos[Math.floor(Math.random() * videos.length)];
    }

    const popup = get('video-notification');
    const thumb = get('video-thumb');
    const titleOverlay = get('video-title-overlay');
    const btnWatch = get('btn-watch-here');
    const btnYoutube = get('btn-youtube');

    // Extract ID
    let videoId = vid.guid.split(':')[2];
    if (!videoId && vid.link) {
        try { videoId = new URL(vid.link).searchParams.get('v'); } catch (e) { }
    }
    currentVideoId = videoId; // Store for watcher

    if (thumb) thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    if (titleOverlay) titleOverlay.textContent = vid.title;
    if (btnYoutube) btnYoutube.href = vid.link;

    if (btnWatch) {
        if (hasWatchedOneVideo) {
            btnWatch.style.opacity = '0.5';
            btnWatch.style.cursor = 'not-allowed';
            btnWatch.onclick = (e) => { e.preventDefault(); showStatusUpdate('⚠️ ლიმიტი ამოწურულია'); };
            btnWatch.textContent = 'ნანახია ✅';
        } else {
            btnWatch.style.opacity = '1';
            btnWatch.style.cursor = 'pointer';
            btnWatch.onclick = window.watchVideoHere;
            btnWatch.textContent = 'აქ ვუყურებ 👁️';
        }
    }

    if (popup) {
        popup.classList.remove('hidden');
        void popup.offsetWidth;
        popup.classList.add('slide-in');

        setTimeout(() => {
            popup.classList.remove('slide-in');
        }, 10000);
    }
}

function startVideoScheduler() {
    videoPopupTimers.forEach(t => clearTimeout(t));
    videoPopupTimers.forEach(t => clearInterval(t)); // Handle intervals too
    videoPopupTimers = [];

    videoTimings.forEach(time => {
        const t = setTimeout(showVideoPopup, time * 1000);
        videoPopupTimers.push(t);
    });

    const maxTime = Math.max(...videoTimings);
    const loopStart = setTimeout(() => {
        const interval = setInterval(showVideoPopup, videoLoopInterval * 1000);
        videoPopupTimers.push(interval);
    }, (maxTime + videoLoopInterval) * 1000); // Start loop AFTER the last fixed event + interval
    videoPopupTimers.push(loopStart);
}

function resetGameLoops() {
    // --- Boss Spawning Intervals ---

    // Regular Bosses
    if (bossInterval) clearInterval(bossInterval);
    bossInterval = setInterval(() => {
        if (!gameActive) return;
        if (score < globalRegularBossThreshold) return;

        const limit = globalBossLimitOverride || 10;
        const rawBossCount = Math.floor(score / globalRegularBossThreshold) + 1;
        const finalBossSpawn = Math.min(rawBossCount, 10);
        const bossHealthMult = rawBossCount > 10 ? (rawBossCount / 10) : 1.0;
        for (let i = 0; i < finalBossSpawn; i++) {
            createStain(true, false, bossHealthMult);
        }
    }, globalBossInterval);

    // Triangle Elite Bosses
    if (triBossInterval) clearInterval(triBossInterval);
    triBossInterval = setInterval(() => {
        if (gameActive && score >= globalTriangleBossThreshold) {
            const rawTriangleCount = Math.floor((score - globalTriangleBossThreshold) / 1000) + 1;
            const finalTriangleSpawn = Math.min(rawTriangleCount, 5);
            const triangleHealthMult = rawTriangleCount > 5 ? (rawTriangleCount / 5) : 1.0;
            for (let i = 0; i < finalTriangleSpawn; i++) {
                createStain(true, true, triangleHealthMult);
            }
        }
    }, globalTriangleBossInterval);

    // Defeat condition check
    if (defeatCheckInterval) clearInterval(defeatCheckInterval);
    defeatCheckInterval = setInterval(checkDefeatCondition, 1000);

    // Round Timer
    timerInterval = setInterval(() => {
        if (gameActive) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            if (get('round-timer-val')) get('round-timer-val').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
        }
    }, 1000);
}

let spawnTimeout;
function scheduleNextStain() {
    clearTimeout(spawnTimeout);
    spawnTimeout = null;

    if (globalFreezeEnemies) {
        spawnTimeout = setTimeout(scheduleNextStain, 1000);
        return;
    }
    if (isUpgradeOpen || !gameActive) return;
    createStain();
    spawnTimeout = setTimeout(scheduleNextStain, getSpawnInterval());
}


// --- Connection Mini-game Mechanic ---

let minigameCurrentIndex = 0;
let minigamePointsData = [];

function startMinigame() {
    if (isMinigameActive || isUpgradeOpen) return;
    isMinigameActive = true;
    gameActive = false;

    const modal = get('minigame-modal');
    modal.classList.remove('hidden');

    let localTimeLeft = 10;
    const timerVal = get('minigame-timer-val');
    if (timerVal) timerVal.textContent = localTimeLeft;

    spawnMinigamePoints();

    if (minigameTimer) clearInterval(minigameTimer);
    minigameTimer = setInterval(() => {
        localTimeLeft--;
        if (timerVal) timerVal.textContent = localTimeLeft;
        if (localTimeLeft <= 0) {
            failMinigame();
        }
    }, 1000);
}

function spawnMinigamePoints() {
    const area = get('minigame-canvas-area');
    if (!area) return;
    area.innerHTML = '';
    minigameCurrentIndex = 0;
    minigamePointsData = [];

    const count = 6 + Math.floor(Math.random() * 4); // 6 to 9 points
    for (let i = 0; i < count; i++) {
        const point = document.createElement('div');
        point.className = 'minigame-point ' + (i === count - 1 ? 'green' : 'red');

        // Random position with some padding
        const pad = 40;
        const x = pad + Math.random() * (area.clientWidth - pad * 2);
        const y = pad + Math.random() * (area.clientHeight - pad * 2);

        point.style.left = `${x}px`;
        point.style.top = `${y}px`;

        // Use mousedown/touchstart for better responsiveness in modals
        const clickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePointClick(i);
        };
        point.addEventListener('mousedown', clickHandler);
        point.addEventListener('touchstart', clickHandler, { passive: false });

        minigamePointsData.push({ x, y, el: point });
        area.appendChild(point);
    }

    // Highlight first point
    if (minigamePointsData.length > 0) {
        minigamePointsData[0].el.classList.add('active');
    }
}

function handlePointClick(index) {
    if (index === minigameCurrentIndex) {
        minigamePointsData[index].el.classList.remove('active');
        minigamePointsData[index].el.style.opacity = '0.5';
        minigamePointsData[index].el.style.transform = 'translate(-50%, -50%) scale(0.8)';

        if (index > 0) {
            const p1 = minigamePointsData[index - 1];
            const p2 = minigamePointsData[index];
            drawMinigameLine(p1.x, p1.y, p2.x, p2.y);
        }

        minigameCurrentIndex++;
        if (minigameCurrentIndex < minigamePointsData.length) {
            minigamePointsData[minigameCurrentIndex].el.classList.add('active');
        } else {
            successMinigame();
        }
    }
}

function drawMinigameLine(x1, y1, x2, y2) {
    const area = get('minigame-canvas-area');
    if (!area) return;
    const line = document.createElement('div');
    line.className = 'minigame-line';

    const dist = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

    line.style.width = `${dist}px`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.transform = `rotate(${angle}deg)`;

    area.appendChild(line);
}

function successMinigame() {
    clearInterval(minigameTimer);
    get('minigame-modal').classList.add('hidden');
    isMinigameActive = false;
    showStatusUpdate('ვაშა! 2 წუთი ნახევარი სიცოცხლე ყველას! 💔✨');
    startHalfHealthEffect();
}

function failMinigame() {
    clearInterval(minigameTimer);
    get('minigame-modal').classList.add('hidden');
    isMinigameActive = false;
    showStatusUpdate('ვერ მოასწარი! სცადე შემდეგ 3,750 ქულაზე. ⌛');
    gameActive = true;
    scheduleNextStain();
}

function skipMinigame() {
    clearInterval(minigameTimer);
    get('minigame-modal').classList.add('hidden');
    isMinigameActive = false;
    showStatusUpdate('გამოტოვებულია ⏩');
    gameActive = true;
    scheduleNextStain();
}

function startHalfHealthEffect() {
    healthHalvedActive = true;
    halfHealthEndTime = Date.now() + 120000;

    const statusEl = get('half-health-status');
    if (statusEl) statusEl.classList.remove('hidden');

    // Visually mark existing stains
    document.querySelectorAll('.stain').forEach(s => {
        s.style.filter = 'drop-shadow(0 0 10px rgba(255, 77, 77, 0.5))';
    });

    const halfTimerInterval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((halfHealthEndTime - Date.now()) / 1000));
        const timerVal = get('half-health-timer');
        if (timerVal) timerVal.textContent = remaining;

        if (remaining <= 0 || !gameActive) {
            clearInterval(halfTimerInterval);
            healthHalvedActive = false;
            if (statusEl) statusEl.classList.add('hidden');
            showStatusUpdate('ნახევარი სიცოცხლის ეფექტი დასრულდა. 🛡️');
            document.querySelectorAll('.stain').forEach(s => s.style.filter = '');
        }
    }, 1000);

    gameActive = true;
    scheduleNextStain();
}

// Draggable & Resizable Player Logic
function initVideoDraggable() {
    const modal = get('video-player-modal');
    const handle = get('video-player-handle');
    const resizer = get('video-player-resizer');

    if (!modal || !handle || !resizer) return;

    let isDragging = false;
    let isResizing = false;
    let startX, startY;
    let startWidth, startHeight, startLeft, startTop;

    handle.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = modal.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        // Switch from bottom/right to left/top for free movement
        modal.style.bottom = 'auto';
        modal.style.right = 'auto';
        modal.style.left = startLeft + 'px';
        modal.style.top = startTop + 'px';

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        e.preventDefault();
    };

    resizer.onmousedown = (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = modal.offsetWidth;
        startHeight = modal.offsetHeight;

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        e.preventDefault();
        e.stopPropagation();
    };

    function onMove(e) {
        if (isDragging) {
            modal.style.left = (startLeft + e.clientX - startX) + 'px';
            modal.style.top = (startTop + e.clientY - startY) + 'px';
        }
        if (isResizing) {
            const newWidth = Math.max(200, startWidth + (e.clientX - startX));
            modal.style.width = newWidth + 'px';
            // Height scales automatically due to 16:9 padding-bottom trick in HTML
        }
    }

    function onEnd() {
        isDragging = false;
        isResizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
    }
}

// --- System Alert Logic ---
let lastAlertMessage = "";
function showSystemAlert(msg) {
    if (!msg || msg === lastAlertMessage) return;
    lastAlertMessage = msg;

    const container = get('global-alert-container');
    const textBox = get('global-alert-text');
    if (!container || !textBox) return;

    textBox.textContent = msg;
    container.classList.remove('hidden');
    setTimeout(() => container.classList.add('active'), 50);

    // Duration: Exactly 2s per word as requested
    const wordCount = msg.trim().split(/\s+/).length;
    const duration = wordCount * 2000;

    setTimeout(() => {
        container.classList.remove('active');
        setTimeout(() => {
            container.classList.add('hidden');
            lastAlertMessage = ""; // Reset to allow same message later if re-triggered
        }, 500);
    }, duration);
}

let currentMassiveAnnouncement = "";
function showMassiveAnnouncement(text, durationSeconds) {
    if (!text || text === currentMassiveAnnouncement) return;
    currentMassiveAnnouncement = text;

    const container = get('massive-announcement-container');
    const box = get('massive-announcement-box');
    const textBox = get('massive-announcement-text');

    if (!container || !box || !textBox) return;

    textBox.textContent = text;
    container.classList.remove('hidden');

    // Animate In (Fall down to position)
    setTimeout(() => {
        box.style.opacity = "1";
        box.style.transform = "translateY(0)";
    }, 50);

    // Auto Hide (Slide away)
    setTimeout(() => {
        box.style.opacity = "0";
        box.style.transform = "translateY(50px)";
        setTimeout(() => {
            container.classList.add('hidden');
            currentMassiveAnnouncement = "";
        }, 500);
    }, durationSeconds * 1000);
}

/* --- Spin Wheel System --- */
const spinPrizes = [
    { label: "ტილოს ძალა +50%", type: "strength", chance: 0.24975, color: "#ff4d4d", probDisplay: "24.9%" },
    { label: "ტილოს რადიუსი +50%", type: "radius", chance: 0.24975, color: "#4facfe", probDisplay: "24.9%" },
    { label: "რობოტის ძალა +50%", type: "bot_pow", chance: 0.24975, color: "#ffd700", probDisplay: "24.9%" },
    { label: "მაგნიტის სიხშირე +50%", type: "magnet", chance: 0.24975, color: "#ff69b4", probDisplay: "24.9%" },
    { label: "1000 ქოინი", type: "coins", chance: 0.001, color: "#ffffff", probDisplay: "0.1%" }
];

let isSpinning = false;
let currentRotation = 0;

function drawWheel() {
    const canvas = get('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const sliceAngle = (2 * Math.PI) / spinPrizes.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Outer Shadow
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    spinPrizes.forEach((prize, i) => {
        const angle = i * sliceAngle;

        // Draw Slice
        ctx.beginPath();
        const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
        grad.addColorStop(0, prize.color);
        grad.addColorStop(1, adjustColor(prize.color, -30)); // Slightly darker edge

        ctx.fillStyle = grad;
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius, angle, angle + sliceAngle);
        ctx.fill();

        // Slice border
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Text with extreme readability
        ctx.save();
        ctx.translate(radius, radius);
        ctx.rotate(angle + sliceAngle / 2);
        ctx.textAlign = "right";

        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";

        const labelText = prize.label;
        ctx.font = "bold 15px Outfit";
        ctx.strokeText(labelText, radius - 40, 0);
        ctx.fillStyle = "#fff";
        ctx.fillText(labelText, radius - 40, 0);

        ctx.font = "900 11px Outfit";
        ctx.strokeText(`(${prize.probDisplay})`, radius - 40, 16);
        ctx.fillStyle = "#ffd700";
        ctx.fillText(`(${prize.probDisplay})`, radius - 40, 16);

        ctx.restore();
    });

    // Decorative Outer Bolts
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30) * Math.PI / 180;
        ctx.beginPath();
        ctx.arc(radius + Math.cos(angle) * (radius - 10), radius + Math.sin(angle) * (radius - 10), 3, 0, 2 * Math.PI);
        ctx.fillStyle = "#fff";
        ctx.fill();
    }

    // Outer Ring (Golden)
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 5, 0, 2 * Math.PI);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Inner Shadow
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 15, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 20;
    ctx.stroke();

    // Center Hub
    ctx.beginPath();
    ctx.arc(radius, radius, 25, 0, 2 * Math.PI);
    const hubGrad = ctx.createRadialGradient(radius, radius, 0, radius, radius, 25);
    hubGrad.addColorStop(0, "#444");
    hubGrad.addColorStop(1, "#111");
    ctx.fillStyle = hubGrad;
    ctx.fill();
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Hub Logo "T"
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 20px Outfit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", radius, radius);
}

function adjustColor(hex, amt) {
    let usePound = false;
    if (hex[0] == "#") { hex = hex.slice(1); usePound = true; }
    let num = parseInt(hex, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

function showSpinWheel() {
    if (!gameActive || isMinigameActive || isUpgradeOpen) return;

    // Pause Game
    gameActive = false;
    if (spawnTimeout) {
        clearTimeout(spawnTimeout);
        spawnTimeout = null;
    }

    drawWheel();
    get('spin-wheel-modal').classList.remove('hidden');
    get('prize-announcement').textContent = "";
    get('spin-btn').disabled = false;
    get('wheel-container').style.transform = `rotate(0deg)`;
    currentRotation = 0;
}

function handleSpinResult() {
    if (isSpinning) return;

    const rand = Math.random();
    let cumulativeChance = 0;
    let winnerIndex = 0;

    for (let i = 0; i < spinPrizes.length; i++) {
        cumulativeChance += spinPrizes[i].chance;
        if (rand < cumulativeChance) {
            winnerIndex = i;
            break;
        }
    }

    const winner = spinPrizes[winnerIndex];
    const sliceAngle = 360 / spinPrizes.length;
    const extraSpins = 8 * 360; // More spins for drama
    const targetAngle = 360 - (winnerIndex * sliceAngle) - (sliceAngle / 2);
    const finalRotation = extraSpins + targetAngle;

    isSpinning = true;
    get('spin-btn').disabled = true;

    // Apply drama easing
    get('wheel-container').style.transition = "transform 5s cubic-bezier(0.1, 0, 0, 1)";
    get('wheel-container').style.transform = `rotate(${finalRotation}deg)`;

    setTimeout(() => {
        isSpinning = false;
        applyPrize(winner);

        // Visual feedback
        get('wheel-container').style.boxShadow = `0 0 50px ${winner.color}`;
        get('prize-announcement').style.transform = "scale(1.2)";
        get('prize-announcement').innerHTML = `<span style="color:${winner.color}; font-size: 1.5rem; text-shadow: 0 0 10px ${winner.color}">🎉 მოიგეთ: ${winner.label}!</span>`;

        setTimeout(() => {
            get('wheel-container').style.boxShadow = "none";
            get('prize-announcement').style.transform = "scale(1)";
            get('spin-wheel-modal').classList.add('hidden');

            // Resume Game
            gameActive = true;
            scheduleNextStain();
        }, 4000);
    }, 5200);
}

function applyPrize(prize) {
    switch (prize.type) {
        case 'strength':
            strengthMultiplier *= 1.5;
            showStatusUpdate('🔥 ტილოს ძალა გაიზარდა 50%-ით!');
            break;
        case 'radius':
            radiusMultiplier *= 1.5;
            showStatusUpdate('📏 რადიუსი გაიზარდა 50%-ით!');
            break;
        case 'bot_pow':
            helperCleaningMultiplier *= 1.5;
            showStatusUpdate('🤖 რობოტის ძალა გაიზარდა 50%-ით!');
            break;
        case 'magnet':
            magnetInterval = Math.max(500, magnetInterval / 1.5);
            showStatusUpdate('🧲 მაგნიტის სიხშირე გაიზარდა 50%-ით!');
            break;
        case 'coins':
            coins += 1000;
            showStatusUpdate('💰 მოიგეთ 1000 ქოინი! იღბლიანი ხარ!');
            break;
    }
    updatePowerStats();
    saveStatsToLocal();
    updateUIValues();
}

// Start Systems
setTimeout(() => {
    fetchYouTubeVideos();
    startVideoScheduler();
    setInterval(fetchYouTubeVideos, 300000);
    initVideoDraggable();
    safeOnClick('spin-btn', handleSpinResult);
}, 2000);
