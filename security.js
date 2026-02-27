// ============================================
// 🛡️ SECURITY & ANTI-CHEAT SYSTEM
// ============================================

// Anti-DevTools Detection (DISABLED)
/*
(function () {
    const devtools = { open: false };
    const threshold = 160;

    const checkDevTools = setInterval(() => {
        if (window.outerWidth - window.innerWidth > threshold ||
            window.outerHeight - window.innerHeight > threshold) {
            if (!devtools.open) {
                devtools.open = true;
                console.clear();
                // alert('⚠️ Developer Tools-ის გამოყენება აკრძალულია! თამაში შეჩერდება.');
                // if (typeof gameActive !== 'undefined') gameActive = false;
            }
        } else {
            devtools.open = false;
        }
    }, 500);
})();
*/

// Console Protection (DISABLED)
/*
(function () {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = console.warn = console.error = function () {
        // Silently ignore console access attempts
    };

    // Detect console opening
    Object.defineProperty(console, '_commandLineAPI', {
        get: function () {
            throw new Error('🛡️ Console access blocked');
        }
    });
})();
*/

// Anti-Debugger (DISABLED)
/*
setInterval(() => {
    const start = performance.now();
    // debugger;
    const end = performance.now();
    if (end - start > 100) {
        window.location.reload();
    }
}, 1000);
*/

// Score Validation System
let lastValidScore = 0;
let scoreChecksum = 0;

function validateScore(newScore) {
    // Check for impossible score jumps
    const scoreDiff = newScore - lastValidScore;
    const maxPossibleJump = 1000; // Maximum realistic score increase per check

    if (scoreDiff > maxPossibleJump) {
        console.warn('🚨 Suspicious score detected');
        return false;
    }

    lastValidScore = newScore;
    scoreChecksum = (newScore * 7919) % 999983; // Simple checksum
    return true;
}

// Coin Validation
let lastValidCoins = 0;

function validateCoins(newCoins) {
    const coinDiff = newCoins - lastValidCoins;
    const maxPossibleJump = 500;

    if (coinDiff > maxPossibleJump && coinDiff > 0) {
        console.warn('🚨 Suspicious coin modification detected');
        return false;
    }

    lastValidCoins = newCoins;
    return true;
}

// LocalStorage Integrity Check
const STORAGE_HASH_KEY = 'tilo_integrity_hash';

function generateStorageHash() {
    const data = {
        coins: localStorage.getItem('tilo_coins'),
        nick: localStorage.getItem('tilo_nick')
    };
    return btoa(JSON.stringify(data));
}

function verifyStorageIntegrity() {
    const currentHash = generateStorageHash();
    const storedHash = localStorage.getItem(STORAGE_HASH_KEY);

    if (storedHash && storedHash !== currentHash) {
        console.warn('🚨 LocalStorage tampering detected');
        // Reset suspicious data
        localStorage.removeItem('tilo_coins');
        localStorage.setItem('tilo_coins', '0');
    }

    localStorage.setItem(STORAGE_HASH_KEY, currentHash);
}

// Run integrity check periodically
setInterval(verifyStorageIntegrity, 5000);

// Prevent common hacking methods
Object.freeze(Object.prototype);
Object.freeze(Array.prototype);

// Disable right-click context menu (REMOVED for Google Security Compliance)
/*
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
});
*/

// Disable common keyboard shortcuts (REMOVED for Google Security Compliance)
/*
document.addEventListener('keydown', (e) => {
    // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (e.keyCode === 123 ||
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
        (e.ctrlKey && e.keyCode === 85)) {
        e.preventDefault();
        return false;
    }
});
*/

// Rate Limiting for API Calls
const rateLimiter = {
    calls: {},
    limit: 10, // Max calls per minute

    check(key) {
        const now = Date.now();
        if (!this.calls[key]) {
            this.calls[key] = [];
        }

        // Remove old calls (older than 1 minute)
        this.calls[key] = this.calls[key].filter(time => now - time < 60000);

        if (this.calls[key].length >= this.limit) {
            console.warn('🚨 Rate limit exceeded for:', key);
            return false;
        }

        this.calls[key].push(now);
        return true;
    }
};

// Export security functions
window.securitySystem = {
    validateScore,
    validateCoins,
    verifyStorageIntegrity,
    rateLimiter
};

console.log('🛡️ Security system initialized');
