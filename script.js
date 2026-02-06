// Safe element getter
const get = (id) => document.getElementById(id);

// State
let isDragging = false;
let currentX, currentY, initialX, initialY;
let xOffset = 0, yOffset = 0;
let score = 0;
let cleanedCountForScaling = 0;
let currentInterval = 10000;
let nickname = localStorage.getItem('tilo_nick') || '';
let coins = parseInt(localStorage.getItem('tilo_coins')) || 0;
if (isNaN(coins)) coins = 0;

let isVip = localStorage.getItem('tilo_vip') === 'true';

// Stats Logic (Owned vs Active)
let totalHelpersOwned = parseInt(localStorage.getItem('tilo_total_helpers')) || 0;
let activeHelpers = parseInt(localStorage.getItem('tilo_active_helpers')) || 0;
if (activeHelpers > totalHelpersOwned) activeHelpers = totalHelpersOwned;

let totalClothOwned = parseInt(localStorage.getItem('tilo_total_cloth')) || 0;
let activeCloth = parseInt(localStorage.getItem('tilo_active_cloth')) || 0;
if (activeCloth > totalClothOwned) activeCloth = totalClothOwned;

let hasKarcher = localStorage.getItem('tilo_has_karcher') === 'true';
let karcherEnabled = localStorage.getItem('tilo_karcher_enabled') !== 'false';
let hasSpeedUp = localStorage.getItem('tilo_has_speedup') === 'true';

// Base stats
let baseClothStrength = 20;
let clothStrength = 0;
let cleaningRadius = 1;

function updatePowerStats() {
    let power = (baseClothStrength + (activeCloth * 15)) * (isVip ? 2 : 1);
    if (hasKarcher && karcherEnabled) {
        power *= 2;
        cleaningRadius = 2.5;
        if (get('cloth')) get('cloth').classList.add('karcher-active');
    } else {
        cleaningRadius = 1;
        if (get('cloth')) get('cloth').classList.remove('karcher-active');
    }
    clothStrength = power;
}

const difficultyIntervalStep = 2000;

// Leaderboard & Time
let leaderboard = JSON.parse(localStorage.getItem('tilo_leaderboard')) || [];
const lastReset = localStorage.getItem('tilo_last_reset');

function checkDailyReset() {
    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;
    if (!lastReset || (now.getTime() - parseInt(lastReset)) > oneDay) {
        if (leaderboard.length > 0) {
            leaderboard.sort((a, b) => b.score - a.score);
            const myRank = leaderboard.findIndex(entry => entry.name === nickname);
            if (myRank >= 0 && myRank < 5) {
                const rewards = [5, 4, 3, 2, 1];
                coins += rewards[myRank];
                saveStats();
                updateUIValues();
            }
        }
        leaderboard = [];
        localStorage.setItem('tilo_leaderboard', JSON.stringify(leaderboard));
        localStorage.setItem('tilo_last_reset', now.getTime().toString());
    }
}

function saveStats() {
    localStorage.setItem('tilo_coins', coins);
    localStorage.setItem('tilo_total_helpers', totalHelpersOwned);
    localStorage.setItem('tilo_active_helpers', activeHelpers);
    localStorage.setItem('tilo_total_cloth', totalClothOwned);
    localStorage.setItem('tilo_active_cloth', activeCloth);
    localStorage.setItem('tilo_vip', isVip);
    localStorage.setItem('tilo_has_karcher', hasKarcher);
    localStorage.setItem('tilo_karcher_enabled', karcherEnabled);
    localStorage.setItem('tilo_has_speedup', hasSpeedUp);
}

function updateUIValues() {
    if (get('coins-val')) get('coins-val').textContent = coins;
    if (get('score-val')) get('score-val').textContent = score;

    // Shop display
    if (get('helper-count')) get('helper-count').textContent = totalHelpersOwned;
    if (get('cloth-level')) get('cloth-level').textContent = totalClothOwned;

    // Settings display
    if (get('active-helpers')) get('active-helpers').textContent = activeHelpers;
    if (get('total-helpers')) get('total-helpers').textContent = totalHelpersOwned;
    if (get('active-cloth')) get('active-cloth').textContent = activeCloth;
    if (get('total-cloth')) get('total-cloth').textContent = totalClothOwned;
    if (get('karcher-status')) {
        if (!hasKarcher) get('karcher-status').textContent = "არ გაქვთ";
        else get('karcher-status').textContent = karcherEnabled ? "ჩართულია" : "გამორთულია";
    }

    if (get('interval-val')) {
        let base = hasSpeedUp ? Math.max(0.01, currentInterval - 5000) : currentInterval;
        const displayInterval = isVip ? (base / 2) : base;
        get('interval-val').textContent = (displayInterval / 1000).toFixed(6);
    }

    updateLeaderboardUI();
}

function updateLeaderboardUI() {
    // Main Modal Update
    const list = get('leaderboard-list');
    const lbModal = get('leaderboard-modal');
    if (list && lbModal && !lbModal.classList.contains('hidden')) {
        renderLeaderboardList(list, 10);
    }

    // Mini HUD Update
    const miniList = get('mini-lb-list');
    if (miniList) {
        miniList.innerHTML = '';
        const top3 = leaderboard.sort((a, b) => b.score - a.score).slice(0, 3);
        top3.forEach((entry, i) => {
            const item = document.createElement('div');
            item.className = 'mini-lb-item';
            item.innerHTML = `
                <span class="mini-lb-name">#${i + 1} ${entry.vip ? '👑' : ''}${entry.name}</span>
                <span class="mini-lb-score">${entry.score}</span>
            `;
            miniList.appendChild(item);
        });
    }
}

function renderLeaderboardList(container, limit) {
    container.innerHTML = '';
    leaderboard.sort((a, b) => b.score - a.score).slice(0, limit).forEach((entry, i) => {
        const item = document.createElement('div');
        item.className = 'lb-item';
        item.style.color = entry.vip ? '#ff8c00' : 'inherit';
        item.innerHTML = `<span class="lb-rank">#${i + 1}</span> <span>${entry.vip ? '👑 ' : ''}${entry.name}</span> <span>${entry.score}</span>`;
        container.appendChild(item);
    });
}

function updateScore(points) {
    if (points > 0) {
        const oldScore = score;
        score += points;
        cleanedCountForScaling += points;

        if (Math.floor(score / 1000) > Math.floor(oldScore / 1000)) {
            coins += Math.floor(score / 1000) - Math.floor(oldScore / 1000);
            saveStats();
            showStatusUpdate("+1 🪙 ქულებისათვის!");
        }

        if (nickname) {
            let userEntry = leaderboard.find(entry => entry.name === nickname);
            if (userEntry) {
                userEntry.score = score;
                userEntry.vip = isVip;
            } else {
                leaderboard.push({ name: nickname, score: score, vip: isVip });
            }
            localStorage.setItem('tilo_leaderboard', JSON.stringify(leaderboard));
        }

        updateUIValues();
    }

    if (cleanedCountForScaling >= 10) {
        cleanedCountForScaling = 0;
        if (currentInterval > 0.01) {
            currentInterval = Math.max(0.01, currentInterval - (currentInterval * 0.1));
            updateUIValues();
            showStatusUpdate(`სირთულე გაიზარდა!`);
        }
    }
}

function showStatusUpdate(text) {
    const ds = get('diff-status');
    if (!ds) return;
    ds.textContent = text;
    ds.style.color = '#ffcc00';
    setTimeout(() => {
        ds.textContent = nickname ? `მოთამაშე: ${nickname}` : 'გამოიყენეთ ტილო საიტის გასაწმენდად';
        ds.style.color = '#666';
    }, 3000);
}

function initUI() {
    const shopModal = get('shop-modal');
    const settingsModal = get('settings-modal');

    get('buy-vip-btn').onclick = () => {
        if (confirm("გსურთ VIP სტატუსის შეძენა 2 ლარად?")) {
            isVip = true;
            updatePowerStats();
            saveStats();
            if (get('cloth')) get('cloth').classList.add('vip-cloth');
            if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
            get('buy-vip-btn').style.display = 'none';
            updateUIValues();
            showStatusUpdate("VIP გააქტიურდა! 👑");
        }
    };

    get('shop-btn').onclick = () => shopModal.classList.remove('hidden');
    get('close-shop').onclick = () => shopModal.classList.add('hidden');
    get('settings-btn').onclick = () => settingsModal.classList.remove('hidden');
    get('close-settings').onclick = () => settingsModal.classList.add('hidden');

    get('buy-helper-btn').onclick = () => {
        if (coins >= 100 && totalHelpersOwned < 10) {
            coins -= 100; totalHelpersOwned++; activeHelpers++;
            saveStats(); updateUIValues(); startHelperBot();
            showStatusUpdate("დამხმარე შეიძინეთ! 🧹");
        }
    };

    const speedBtn = get('buy-speed-btn');
    if (hasSpeedUp) { speedBtn.textContent = "შეძენილია"; speedBtn.disabled = true; }
    speedBtn.onclick = () => {
        if (!hasSpeedUp && coins >= 50) {
            coins -= 50; hasSpeedUp = true;
            saveStats(); updateUIValues();
            speedBtn.textContent = "შეძენილია"; speedBtn.disabled = true;
            showStatusUpdate(`ლაქები აჩქარდა!`);
        }
    };

    get('buy-cloth-power-btn').onclick = () => {
        if (coins >= 70 && totalClothOwned < 10) {
            coins -= 70; totalClothOwned++; activeCloth++;
            updatePowerStats(); saveStats(); updateUIValues();
            showStatusUpdate(`წმენდა გაძლიერდა!`);
        }
    };

    get('buy-karcher-btn').onclick = () => {
        if (coins >= 1000 && !hasKarcher) {
            coins -= 1000; hasKarcher = true; karcherEnabled = true;
            updatePowerStats(); saveStats(); updateUIValues();
            get('buy-karcher-btn').textContent = "შეძენილია"; get('buy-karcher-btn').disabled = true;
            showStatusUpdate(`კერხერი გააქტიურდა! ⚡`);
        }
    };

    get('set-dec-helper').onclick = () => {
        if (activeHelpers > 0) {
            activeHelpers--; saveStats(); updateUIValues();
            const bots = document.querySelectorAll('.helper-bot');
            if (bots.length > 0) bots[bots.length - 1].remove();
        }
    };
    get('set-inc-helper').onclick = () => {
        if (activeHelpers < totalHelpersOwned) {
            activeHelpers++; saveStats(); updateUIValues();
            startHelperBot();
        }
    };

    get('set-dec-cloth').onclick = () => { if (activeCloth > 0) { activeCloth--; updatePowerStats(); saveStats(); updateUIValues(); } };
    get('set-inc-cloth').onclick = () => { if (activeCloth < totalClothOwned) { activeCloth++; updatePowerStats(); saveStats(); updateUIValues(); } };

    get('toggle-karcher-btn').onclick = () => {
        if (hasKarcher) { karcherEnabled = !karcherEnabled; updatePowerStats(); saveStats(); updateUIValues(); }
    };

    get('donate-btn').onclick = () => get('donate-modal').classList.remove('hidden');
    get('close-donate').onclick = () => get('donate-modal').classList.add('hidden');
    document.querySelectorAll('.buy-coins-btn').forEach(btn => {
        btn.onclick = () => {
            const amount = parseInt(btn.dataset.coins);
            if (confirm(`გსურთ ${amount} ქოინის ყიდვა?`)) {
                coins += amount; saveStats(); updateUIValues();
                showStatusUpdate(`დაგემატათ ${amount} ქოინი! 💎`);
            }
        };
    });

    get('leaderboard-btn').onclick = () => {
        updateLeaderboardUI();
        get('leaderboard-modal').classList.remove('hidden');
    };
    get('close-leaderboard').onclick = () => get('leaderboard-modal').classList.add('hidden');

    get('save-nick-btn').onclick = () => {
        const val = get('nickname-input').value.trim();
        if (val) {
            nickname = val; localStorage.setItem('tilo_nick', nickname);
            get('auth-modal').classList.add('hidden'); updateScore(0);
        }
    };
}

function startHelperBot() {
    const container = get('canvas-container');
    const bot = document.createElement('div');
    bot.className = 'helper-bot';
    container.appendChild(bot);

    function moveBot() {
        if (!bot.parentElement) return;
        const stains = document.querySelectorAll('.stain');
        if (stains.length > 0) {
            const target = stains[Math.floor(Math.random() * Math.min(stains.length, 3))];
            const rect = target.getBoundingClientRect();
            bot.style.left = `${rect.left}px`; bot.style.top = `${rect.top}px`;
            setTimeout(() => {
                if (target.parentElement) {
                    target.dataset.health = 0;
                    checkCleaningAtPos(rect.left + 30, rect.top + 30);
                }
            }, 1000);
        } else {
            bot.style.left = `${Math.random() * (window.innerWidth - 60)}px`;
            bot.style.top = `${Math.random() * (window.innerHeight - 60)}px`;
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
    let strengthLevel = 1;
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
    stain.style.opacity = '0.4';
    stain.dataset.health = health; stain.dataset.maxHealth = health;
    container.appendChild(stain);

    const strengthenTimer = setInterval(() => {
        if (!stain.parentElement) { clearInterval(strengthenTimer); return; }
        strengthLevel++; health *= 2;
        stain.dataset.health = health; stain.dataset.maxHealth = health;
        const curS = parseFloat(stain.style.width);
        stain.style.width = `${curS * 1.2}px`; stain.style.height = `${curS * 1.2}px`;
        if (strengthLevel === 2) {
            stain.style.backgroundColor = stain.style.backgroundColor.replace('0.4', '0.7').replace('0.3', '0.6').replace('0.2', '0.5');
            stain.style.filter = 'blur(5px)';
        } else if (strengthLevel >= 3) {
            stain.style.backgroundColor = '#333'; stain.classList.add('pulse-animation');
        }
    }, 5000);
}

function checkCleaning() {
    const cloth = get('cloth');
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
    for (let i = 0; i < 3; i++) {
        const p = document.createElement('div');
        p.style.position = 'absolute'; p.style.left = `${x}px`; p.style.top = `${y}px`;
        p.style.width = '6px'; p.style.height = '6px'; p.style.backgroundColor = color;
        p.style.borderRadius = '50%'; p.style.pointerEvents = 'none'; container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const tx = Math.cos(angle) * 40; const ty = Math.sin(angle) * 40;
        p.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${tx}px,${ty}px) scale(0)`, opacity: 0 }],
            { duration: 600 }).onfinish = () => p.remove();
    }
}

function getSpawnInterval() {
    let base = hasSpeedUp ? Math.max(0.01, currentInterval - 5000) : currentInterval;
    const displayInterval = isVip ? (base / 2) : base;
    return Math.max(0.01, displayInterval);
}

function scheduleNextStain() {
    setTimeout(() => { createStain(); scheduleNextStain(); }, getSpawnInterval());
}

function centerCloth() {
    const cloth = get('cloth');
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
    if (e.target === cloth || (cloth && cloth.contains(e.target))) isDragging = true;
}
function dragEnd() { if (currentX !== undefined) initialX = currentX; if (currentY !== undefined) initialY = currentY; isDragging = false; }
function drag(e) {
    if (isDragging) {
        e.preventDefault();
        const cx = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
        const cy = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
        currentX = cx - initialX; currentY = cy - initialY;
        xOffset = currentX; yOffset = currentY;
        setTranslate(currentX, currentY, get('cloth'));
        checkCleaning();
    }
}

window.addEventListener('load', () => {
    updatePowerStats();
    initUI();
    centerCloth();
    checkDailyReset();
    updateUIValues();
    if (isVip) {
        if (get('vip-tag')) get('vip-tag').classList.remove('vip-hidden');
        if (get('buy-vip-btn')) get('buy-vip-btn').style.display = 'none';
        if (get('cloth')) get('cloth').classList.add('vip-cloth');
    }
    for (let i = 0; i < activeHelpers; i++) startHelperBot();
    if (!nickname && get('auth-modal')) get('auth-modal').classList.remove('hidden');
    scheduleNextStain();
});

window.addEventListener("mousedown", dragStart); window.addEventListener("mouseup", dragEnd); window.addEventListener("mousemove", drag);
window.addEventListener("touchstart", dragStart); window.addEventListener("touchend", dragEnd); window.addEventListener("touchmove", drag);
window.addEventListener('resize', centerCloth);
