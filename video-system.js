import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

const DB_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DB_URL);

let videoChannels = [{ id: 'UCycgfC-1XTtOeMLr5Vz77dg', weight: 100 }];
let allChannelVideos = {};
let currentVideoId = '';
const get = id => document.getElementById(id);

// --- Injected HTML for global usage (No need to manual edit 10 files) ---
function injectVideoElements() {
    if (get('video-notification')) return; // Already exists

    const style = document.createElement('style');
    style.textContent = `
        @keyframes glow {
            from { text-shadow: 0 0 5px cyan, 0 0 10px cyan; }
            to { text-shadow: 0 0 10px cyan, 0 0 20px cyan, 0 0 30px #00ffff; }
        }
        #video-notification.slide-in {
            left: 20px !important;
        }
    `;
    document.head.appendChild(style);

    const markup = `

    <!-- Global Video Notification -->
    <div id="video-notification" class="hidden"
        style="position: fixed; top: 100px; left: -300px; width: 280px; background: rgba(16, 16, 30, 0.95); border: 2px solid cyan; border-radius: 12px; padding: 12px; z-index: 2000000; box-shadow: 0 0 20px rgba(0, 255, 255, 0.3); backdrop-filter: blur(5px); transition: left 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h3 style="margin: 0; color: cyan; font-size: 0.9rem;">✨ ახალი ვიდეო!</h3>
            <button id="hide-video-btn" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer;">&times;</button>
        </div>

        <div id="video-thumb-container" style="position: relative; overflow: hidden; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px; cursor: pointer;">
            <img id="video-thumb" src="" alt="Thumbnail" style="width: 100%; height: auto; display: block; filter: brightness(0.8);">
            <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
                <div style="width: 40px; height: 40px; background: rgba(255,0,0,0.8); border-radius: 50%; display: flex; align-items: center; justify-content: center;"> ▶️ </div>
            </div>
        </div>
        <div id="video-notif-title" style="font-size: 0.8rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: white;">Loading...</div>

        <div style="display: flex; gap: 5px; margin-top: 5px;">
            <button id="btn-watch-here" style="flex: 1; background: rgba(0, 255, 255, 0.2); color: cyan; border: 1px solid cyan; border-radius: 5px; cursor: pointer; padding: 6px; font-weight: bold; font-size: 0.75rem;">ვუყურებ 👁️</button>
            <a id="btn-youtube" href="#" target="_blank" style="flex: 1; display: flex; align-items: center; justify-content: center; background: rgba(255, 0, 0, 0.8); color: white; border: none; border-radius: 5px; text-decoration: none; font-size: 0.75rem; padding: 6px; font-weight: bold;">YouTube ↗️</a>
        </div>
    </div>

    <!-- Mini Video Player -->
    <div id="video-player-modal" class="hidden"
        style="position: fixed; bottom: 80px; right: 20px; width: 380px; max-width: 90vw; z-index: 3000000; box-shadow: 0 10px 40px rgba(0,0,0,0.8); background: black; border: 2px solid cyan; border-radius: 12px; overflow: visible; display: flex; flex-direction: column;">
        <div id="video-player-handle" style="height: 30px; background: rgba(0,0,0,0.9); cursor: move; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; border-bottom: 1px solid rgba(0,255,255,0.3); border-top-left-radius: 10px; border-top-right-radius: 10px;">
            <span style="font-size: 0.7rem; color: cyan; font-weight: bold;">📺 TILO VIDEO PLAYER</span>
            <button id="close-video-player-btn" style="background: rgba(255,0,0,0.8); color: white; border: none; width: 20px; height: 20px; border-radius: 4px; cursor: pointer;">&times;</button>
        </div>
        <div style="position: relative; padding-bottom: 56.25%; height: 0;">
            <iframe id="video-iframe" src="" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
        <div id="video-player-resizer" style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; cursor: nwse-resize; background: cyan; border-bottom-right-radius: 10px; opacity: 0.5;"></div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', markup);

    // Attach internal event listeners
    get('hide-video-btn').onclick = () => window.hideVideoPopup();
    get('video-thumb-container').onclick = () => window.watchVideoHere();
    get('btn-watch-here').onclick = () => window.watchVideoHere();
    get('close-video-player-btn').onclick = () => window.closeVideoPlayer();

    setupVideoPlayerDrag();
}

async function refreshGlobalConfig() {
    try {
        const events = await sql`SELECT event_type, event_value FROM global_events WHERE expires_at > NOW()`;
        let forcedVideo = null;

        events.forEach(ev => {
            if (ev.event_type === 'video_config') {
                try {
                    const cfg = JSON.parse(ev.event_value);
                    if (Array.isArray(cfg) && cfg.length > 0) videoChannels = cfg;
                } catch (e) { }
            }
            if (ev.event_type === 'forced_video') {
                try {
                    const cfg = JSON.parse(ev.event_value);
                    if (cfg && cfg.id) forcedVideo = cfg;
                } catch (e) { }
            }
        });

        if (forcedVideo) handleForcedVideo(forcedVideo);
    } catch (e) { console.error("Video config error", e); }
}

let lastForcedVideoId = '';
function handleForcedVideo(cfg) {
    if (cfg.id === lastForcedVideoId) return;
    lastForcedVideoId = cfg.id;
    currentVideoId = cfg.id;
    const popup = get('video-notification');
    if (popup) {
        get('video-thumb').src = `https://img.youtube.com/vi/${cfg.id}/maxresdefault.jpg`;
        get('video-notif-title').textContent = "📢 სპეციალური შემოთავაზება!";
        get('btn-youtube').href = cfg.link || `https://youtube.com/watch?v=${cfg.id}`;
        popup.classList.remove('hidden');
        void popup.offsetWidth;
        popup.classList.add('slide-in');
    }
}

async function fetchChannelVideos() {
    const newAllVideos = {};
    for (const channel of videoChannels) {
        const rss = channel.id.startsWith('UC') ? 
            `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}` : 
            `https://www.youtube.com/feeds/videos.xml?user=${channel.id}`;
        const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;
        try {
            const res = await fetch(api);
            const data = await res.json();
            if (data.status === 'ok') newAllVideos[channel.id] = data.items;
        } catch (e) { }
    }
    allChannelVideos = newAllVideos;
}

window.showVideoPopup = () => {
    const popup = get('video-notification');
    if (get('video-player-modal') && !get('video-player-modal').classList.contains('hidden')) return;

    let vid = null;
    let videoId = '';

    if (Object.keys(allChannelVideos).length > 0) {
        const ids = Object.keys(allChannelVideos);
        const videos = allChannelVideos[ids[0]];
        vid = videos[Math.floor(Math.random() * videos.length)];
        
        videoId = vid.guid?.split(':')[2];
        if (!videoId && vid.link) {
            try { videoId = new URL(vid.link).searchParams.get('v'); } catch (e) { }
        }
    }

    // Fallback if RSS fails or no videos found
    if (!videoId) {
        videoId = 'dQw4w9WgXcQ'; // Rickroll as a placeholder for testing (User can change this)
        vid = { title: 'TILO.LIFE - უყურე სიახლეებს!', link: `https://youtube.com/watch?v=${videoId}` };
    }

    currentVideoId = videoId;
    get('video-thumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    get('video-notif-title').textContent = vid.title;
    get('btn-youtube').href = vid.link;

    if (popup) {
        popup.classList.remove('hidden');
        void popup.offsetWidth;
        popup.classList.add('slide-in');
        setTimeout(() => { if (!popup.matches(':hover')) popup.classList.remove('slide-in'); }, 15000);
    }
};

window.hideVideoPopup = () => {
    const popup = get('video-notification');
    if (popup) popup.classList.remove('slide-in');
};

window.watchVideoHere = () => {
    const modal = get('video-player-modal');
    const iframe = get('video-iframe');
    if (!iframe || !currentVideoId) return;
    iframe.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1`;
    modal.classList.remove('hidden');
    window.hideVideoPopup();
};

window.closeVideoPlayer = () => {
    const modal = get('video-player-modal');
    const iframe = get('video-iframe');
    if (iframe) iframe.src = '';
    if (modal) modal.classList.add('hidden');
};

function setupVideoPlayerDrag() {
    const modal = get('video-player-modal');
    const handle = get('video-player-handle');
    const resizer = get('video-player-resizer');
    if (!modal || !handle || !resizer) return;

    let isDragging = false, isResizing = false;
    let startX, startY, startLeft, startTop, startWidth;

    handle.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = modal.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        modal.style.bottom = 'auto'; modal.style.right = 'auto';
        modal.style.left = startLeft + 'px'; modal.style.top = startTop + 'px';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        e.preventDefault();
    };

    resizer.onmousedown = (e) => {
        isResizing = true;
        startX = e.clientX; startWidth = modal.offsetWidth;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        e.preventDefault(); e.stopPropagation();
    };

    function onMove(e) {
        if (isDragging) {
            modal.style.left = (startLeft + e.clientX - startX) + 'px';
            modal.style.top = (startTop + e.clientY - startY) + 'px';
        }
        if (isResizing) {
            modal.style.width = Math.max(200, startWidth + (e.clientX - startX)) + 'px';
        }
    }
    function onEnd() {
        isDragging = isResizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
    }
}

// Initialize
(async function init() {
    if (window.location.pathname.includes('admin.html')) return;
    
    injectVideoElements();
    await refreshGlobalConfig();
    fetchChannelVideos();

    setTimeout(window.showVideoPopup, 5000);
    setInterval(window.showVideoPopup, 300000);
    setInterval(async () => {
        await refreshGlobalConfig();
        await fetchChannelVideos();
    }, 30000);
})();
