
const get = id => document.getElementById(id);

class HomeGame {
    constructor() {
        this.container = get('game-bg-layer');
        this.cloth = get('tilo-cloth');
        this.stains = [];
        this.maxStains = 10;
        this.isNavigating = false;
        
        this.init();
    }

    init() {
        if (!this.container) return;

        // Follow mouse
        window.addEventListener('mousemove', (e) => this.handleMove(e.clientX, e.clientY));
        window.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        // Spawn loop
        this.spawnInterval = setInterval(() => {
            if (this.stains.length < this.maxStains) {
                this.spawnStain();
            }
        }, 200);

        // Click to clean
        window.addEventListener('mousedown', () => this.cleanAllAround());
    }

    handleMove(x, y) {
        if (!this.cloth) return;
        this.cloth.style.left = `${x}px`;
        this.cloth.style.top = `${y}px`;
        this.cloth.style.opacity = '1';
        
        this.checkCollisions(x, y);
    }

    spawnStain() {
        const stain = document.createElement('div');
        stain.className = 'bg-stain';
        const size = 60 + Math.random() * 80;
        stain.style.width = `${size}px`;
        stain.style.height = `${size}px`;
        
        // Random color but keeping it subtle for dark mode
        const h = Math.random() * 360;
        stain.style.background = `radial-gradient(circle, hsla(${h}, 70%, 50%, 0.2) 0%, transparent 70%)`;
        
        stain.style.left = `${Math.random() * 90 + 5}%`;
        stain.style.top = `${Math.random() * 80 + 10}%`;
        
        this.container.appendChild(stain);
        this.stains.push(stain);
    }

    checkCollisions(x, y) {
        this.stains.forEach((stain, index) => {
            const rect = stain.getBoundingClientRect();
            const sx = rect.left + rect.width / 2;
            const sy = rect.top + rect.height / 2;
            const dist = Math.hypot(x - sx, y - sy);
            
            if (dist < 80) {
                this.removeStain(stain, index);
            }
        });
    }

    cleanAllAround() {
        // Maybe a small pulse effect
        if (this.cloth) {
            this.cloth.style.transform = 'translate(-50%, -50%) scale(1.2)';
            setTimeout(() => {
                this.cloth.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 100);
        }
    }

    removeStain(stain, index) {
        stain.classList.add('cleaning');
        this.stains.splice(index, 1);
        setTimeout(() => stain.remove(), 500);
    }

    async navigateWithAnim(url, newTab = false) {
        if (this.isNavigating && !newTab) return;
        if (!newTab) this.isNavigating = true;

        // Add a "wipe" effect to the screen
        const wipe = document.createElement('div');
        wipe.id = 'transition-wipe';
        wipe.style.cssText = `
            position: fixed;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: var(--news-primary);
            z-index: 1000000;
            transition: left 0.6s cubic-bezier(0.645, 0.045, 0.355, 1);
            pointer-events: none;
        `;
        document.body.appendChild(wipe);
        
        // Use the cloth to "wipe"
        if (this.cloth) {
            this.cloth.style.transition = 'all 0.6s cubic-bezier(0.645, 0.045, 0.355, 1)';
            this.cloth.style.left = '100vw';
        }

        setTimeout(() => { wipe.style.left = '0'; }, 10);

        setTimeout(() => {
            if (newTab) {
                window.open(url, '_blank');
                wipe.style.left = '100%';
                setTimeout(() => {
                    wipe.remove();
                    this.isNavigating = false;
                }, 600);
            } else {
                window.location.href = url;
                // Safety: if navigation is cancelled or takes too long
                setTimeout(() => {
                    wipe.style.left = '100%';
                    setTimeout(() => wipe.remove(), 600);
                    this.isNavigating = false;
                }, 2000);
            }
        }, 650);
    }
}

// Global initialization and cleanup
document.addEventListener('DOMContentLoaded', () => {
    window.homeGame = new HomeGame();
    
    // Check if we arrived with a wipe (from a previous page)
    const existingWipe = get('transition-wipe');
    if (existingWipe) {
        existingWipe.style.left = '100%';
        setTimeout(() => existingWipe.remove(), 600);
    }
});

// Handle Back/Forward Cache
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        const wipe = get('transition-wipe');
        if (wipe) wipe.remove();
        if (window.homeGame) window.homeGame.isNavigating = false;
    }
});

function handleMenuClick(type) {
    let url = '';
    let newTab = false;
    switch(type) {
        case 'abuse': url = 'all-abuse.html'; break;
        case 'roblox': 
            url = 'https://www.roblox.com/communities/4403989/ggitems#!/store'; 
            newTab = true;
            break;
        case 'game': url = 'game.html'; break;
    }
    
    if (window.homeGame) {
        window.homeGame.navigateWithAnim(url, newTab);
    } else {
        if (newTab) window.open(url, '_blank');
        else window.location.href = url;
    }
}
