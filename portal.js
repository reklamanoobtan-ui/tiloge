import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

const DB_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DB_URL);

let userEmail = localStorage.getItem('tilo_email');
let nickname = localStorage.getItem('tilo_nick');
let currentNewsId = null;
let currentCategory = null;
let replyingToId = null;

const get = id => document.getElementById(id);

async function init() {
    updateAuthUI();
    loadNews();
    setupEventListeners();

    // Dark mode init — default ON, user can turn off
    const darkPref = localStorage.getItem('tilo_dark_mode');
    if (darkPref !== 'false') {
        document.body.classList.add('dark-mode');
        const cb = get('dark-mode-checkbox');
        if (cb) cb.checked = true;
    }



    // Check for direct news link
    const params = new URLSearchParams(window.location.search);
    const newsId = params.get('id');
    if (newsId) {
        setTimeout(() => openNews(newsId), 500);
    }

    initVideoSystem();
    setupChat();
}

function updateAuthUI() {
    if (userEmail) {
        get('user-profile-header').classList.remove('hidden');
        get('login-nav-btn').classList.add('hidden');
        get('profile-btn').textContent = nickname ? nickname.charAt(0).toUpperCase() : 'U';
        get('header-nickname').textContent = nickname || '';
    } else {
        get('user-profile-header').classList.add('hidden');
        get('login-nav-btn').classList.remove('hidden');
    }
}

let ITEMS_PER_PAGE = 10;
let currentPage = 1;
let allNewsCache = [];

async function loadNews() {
    try {
        let news;
        if (currentCategory && currentCategory !== 'მთავარი') {
            ITEMS_PER_PAGE = 14;
            news = await sql`SELECT * FROM news WHERE category = ${currentCategory} ORDER BY created_at DESC, id DESC`;
        } else {
            ITEMS_PER_PAGE = 10;
            news = await sql`SELECT * FROM news WHERE category != 'Steam Prices' ORDER BY created_at DESC, id DESC`;
        }
        allNewsCache = news;
        currentPage = 1;
        renderNewsPage();
        loadAdminAbuseSidebar();
    } catch (e) {
        console.error("News Load Error:", e);
    }
}

function renderNewsPage() {
    const grid = get('news-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (allNewsCache.length === 0) {
        grid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 50px; opacity: 0.5;">სიახლეები ჯერ არ არის.</p>';
        renderPagination(0);
        return;
    }

    const totalPages = Math.ceil(allNewsCache.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = allNewsCache.slice(start, start + ITEMS_PER_PAGE);

    pageItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-card';
        card.onclick = () => openNews(item.id);

        const date = new Date(item.created_at).toLocaleDateString('ka-GE');
        const img = item.image_url || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1000';

        card.innerHTML = `
            <img src="${img}" class="news-img" alt="${item.title}" referrerpolicy="no-referrer">
            <div class="news-body">
                <div class="news-meta">
                    <span>${item.category}</span>
                    <span>${date}</span>
                </div>
                <h3 class="news-title">${item.title}</h3>
                <p class="news-excerpt">${stripHtml(item.content)}</p>
            </div>
        `;
        grid.appendChild(card);
    });

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = get('pagination-container');
    if (!container) return;
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const btnStyle = (active) => `
        padding: 8px 14px;
        border-radius: 10px;
        border: 1px solid var(--news-border);
        background: ${active ? 'var(--news-primary)' : 'var(--news-card-bg)'};
        color: ${active ? '#fff' : 'var(--news-text)'};
        cursor: pointer;
        font-weight: ${active ? '800' : '600'};
        font-size: 0.85rem;
        transition: all 0.2s;
    `;

    // Prev button
    if (currentPage > 1) {
        const prev = document.createElement('button');
        prev.textContent = '← წინა';
        prev.style.cssText = btnStyle(false);
        prev.onclick = () => { currentPage--; renderNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        container.appendChild(prev);
    }

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.style.cssText = btnStyle(i === currentPage);
        btn.onclick = () => { currentPage = i; renderNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        container.appendChild(btn);
    }

    // Next button
    if (currentPage < totalPages) {
        const next = document.createElement('button');
        next.textContent = 'შემდეგი →';
        next.style.cssText = btnStyle(false);
        next.onclick = () => { currentPage++; renderNewsPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        container.appendChild(next);
    }
}

async function loadAdminAbuseSidebar() {
    const sidebar = get('sidebar-abuse-list');
    if (!sidebar) return;

    try {
        const slots = await sql`
            SELECT * FROM admin_abuse 
            ORDER BY 
                CASE WHEN end_time > NOW() THEN 0 ELSE 1 END, 
                end_time ASC, 
                created_at DESC 
            LIMIT 3
        `;
        sidebar.innerHTML = '';

        slots.forEach(s => {
            const el = document.createElement('div');
            el.className = 'sidebar-item';
            el.style.flexDirection = 'column';
            el.style.alignItems = 'flex-start';
            el.style.padding = '15px';
            el.style.gap = '12px';
            el.style.cursor = 'default';

            const img = s.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1000';

            // Countdown logic
            const timerId = `timer-${s.id}`;

            el.innerHTML = `
                <div onclick="location.href='top.html?id=${s.id}'" style="cursor: pointer; display: flex; gap: 12px; width: 100%; transition: 0.2s;">
                    <img src="${img}" style="width: 70px; height: 70px; border-radius: 12px; object-fit: cover; flex-shrink: 0;" referrerpolicy="no-referrer">
                    <div style="display: flex; flex-direction: column; gap: 5px; flex: 1; overflow: hidden;">
                        <div style="font-weight: 800; font-size: 0.95rem; color: var(--news-text); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.title}</div>
                        <div id="${timerId}" style="font-family: monospace; font-weight: 900; color: var(--news-primary); font-size: 1.1rem; letter-spacing: 1px;">00:00:00</div>
                    </div>
                </div>
            `;
            sidebar.appendChild(el);

            // Timer interval
            let deleteTriggered = false;
            const updateTimer = async () => {
                const timerEl = get(timerId);
                if (!timerEl) return;

                if (!s.end_time) {
                    timerEl.textContent = "დაელოდეთ...";
                    return;
                }

                const now = new Date();
                const end = new Date(s.end_time);
                const diff = end - now;

                if (diff <= 0) {
                    timerEl.textContent = "დასრულდა";
                    timerEl.style.color = "#ff4757";

                    // Auto-delete after 1 minute
                    if (!deleteTriggered) {
                        deleteTriggered = true;
                        setTimeout(async () => {
                            try {
                                await sql`DELETE FROM admin_abuse WHERE id = ${s.id}`;
                                loadAdminAbuseSidebar();
                            } catch (err) { console.error("Auto-delete error:", err); }
                        }, 60000);
                    }
                    return;
                }

                const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const s_val = Math.floor((diff % (1000 * 60)) / 1000);

                let timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s_val.toString().padStart(2, '0')}`;
                if (d > 0) timeStr = `${d}დ ${timeStr}`;

                timerEl.textContent = timeStr;
            };

            updateTimer();
            setInterval(updateTimer, 1000);
        });

        // Add "See All" button
        if (slots.length > 0) {
            const allBtn = document.createElement('a');
            allBtn.href = 'all-abuse.html';
            allBtn.style.cssText = 'display:block; text-align:center; padding:12px; margin-top:10px; background:rgba(0,102,204,0.1); border:1px dashed var(--news-primary); border-radius:12px; color:var(--news-primary); text-decoration:none; font-weight:800; font-size:0.85rem; transition:0.3s;';
            allBtn.textContent = 'ნახეთ სრულად 📂';
            sidebar.appendChild(allBtn);
        }

        // --- MOBILE ABUSE LOGIC (2 Column Grid, Timer-Focused) ---
        if (window.innerWidth < 768) {
            const mobileContainer = get('mobile-abuse-list');
            if (mobileContainer && slots.length > 0) {
                mobileContainer.innerHTML = '';
                mobileContainer.style.cssText = 'display:flex;flex-direction:column;padding:15px 0;';

                // Header
                const mobHeader = document.createElement('div');
                mobHeader.style.cssText = 'font-weight:900;color:var(--news-text,#222);margin-bottom:12px;font-size:1rem;display:flex;align-items:center;gap:8px;';
                mobHeader.innerHTML = '🔥 <span>TOP 5 - ADMIN ABUSE</span>';
                mobileContainer.appendChild(mobHeader);

                // 2-column grid
                const grid = document.createElement('div');
                grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
                mobileContainer.appendChild(grid);

                slots.forEach(s => {
                    const el = document.createElement('div');
                    el.style.cssText = 'background:var(--news-card-bg, #fff);border-radius:14px;padding:10px;display:flex;align-items:center;gap:10px;color:var(--news-text,#222);border:1px solid var(--news-border, #eee);box-shadow:0 2px 10px rgba(0,0,0,0.08);cursor:pointer;transition:transform 0.2s;';

                    el.onclick = (e) => {
                        e.stopPropagation();
                        location.href = `top.html?id=${s.id}`;
                    };

                    const img = s.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1000';
                    const timerId = `mob-timer-${s.id}`;

                    el.innerHTML = `
                        <img src="${img}" style="width:45px;height:45px;border-radius:10px;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer">
                        <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;gap:2px;">
                            <div style="font-weight:700;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0.8;">${s.title}</div>
                            <div id="${timerId}" style="font-family:monospace;font-weight:900;color:var(--news-primary,#6c5ce7);font-size:1.1rem;letter-spacing:1px;">00:00:00</div>
                        </div>
                    `;
                    grid.appendChild(el);

                    const updateMobTimer = () => {
                        const timerEl = get(timerId);
                        if (!timerEl) return;
                        if (!s.end_time) { timerEl.textContent = "⏱️"; return; }
                        const now = new Date();
                        const end = new Date(s.end_time);
                        const diff = end - now;
                        if (diff <= 0) { timerEl.textContent = "END"; timerEl.style.color = '#ff4d4d'; return; }

                        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const sv = Math.floor((diff % (1000 * 60)) / 1000);

                        let timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sv).padStart(2, '0')}`;
                        if (d > 0) timeStr = `${d}დ ${timeStr}`;

                        timerEl.textContent = timeStr;
                    };
                    updateMobTimer();
                    setInterval(updateMobTimer, 1000);
                });
            }
        }

    } catch (e) {
        console.error("Sidebar Abuse Load Error:", e);
    }
}

async function openNews(id) {
    currentNewsId = id;
    get('news-grid').classList.add('hidden');
    get('pagination-container').style.display = 'none';
    get('news-detail').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const res = await sql`SELECT * FROM news WHERE id = ${id}`;
        const item = res[0];
        const date = new Date(item.created_at).toLocaleString('ka-GE');

        let visualContent = '';
        if (item.video_url) {
            const embedUrl = getYouTubeEmbed(item.video_url);
            visualContent = `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border:0;" allowfullscreen></iframe>
            </div>`;
        } else if (item.image_url) {
            visualContent = `<img src="${item.image_url}" referrerpolicy="no-referrer" style="width: 100%; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">`;
        }

        get('detail-content').innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; gap: 20px;">
                <h1 style="font-size: 2.5rem; font-weight: 900; margin: 0; line-height: 1.1; color: var(--news-text);">${item.title}</h1>
                <button onclick="shareNews()" class="nav-link" style="background: var(--news-bg); border: 1px solid var(--news-border); color: var(--news-text); padding: 10px 18px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: 800;">
                    🔗 გაზიარება
                </button>
            </div>
            <div style="font-size: 0.95rem; color: var(--news-text-dim); margin-bottom: 35px; display: flex; align-items: center; gap: 10px; font-weight: 600;">
                <span>✍️ ${item.author}</span>
                <span>•</span>
                <span>📅 ${date}</span>
                <span>•</span>
                <span style="color: var(--news-primary);">🏷️ ${item.category}</span>
            </div>
            ${visualContent}
            <div style="line-height: 1.8; font-size: 1.15rem; color: var(--news-text); font-family: 'Inter', sans-serif;">${item.content}</div>
        `;

        loadComments(id);
        loadLikes(id);
    } catch (e) {
        console.error("Detail Load Error:", e);
    }
}

function getYouTubeEmbed(url) {
    if (url.includes('youtube.com/embed/')) return url;
    let videoId = '';
    if (url.includes('v=')) videoId = url.split('v=')[1].split('&')[0];
    else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1].split('?')[0];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
}

window.showNewsList = () => {
    get('news-grid').classList.remove('hidden');
    get('pagination-container').style.display = 'flex';
    get('news-detail').classList.add('hidden');
    currentNewsId = null;
};

async function loadComments(id) {
    const list = get('comments-list');
    list.innerHTML = '<p style="opacity:0.5;">იტვირთება...</p>';
    try {
        const comments = await sql`SELECT * FROM news_comments WHERE news_id = ${id} ORDER BY created_at ASC`;
        list.innerHTML = '';
        if (comments.length === 0) {
            list.innerHTML = '<p style="opacity:0.5;">კომენტარები ჯერ არ არის.</p>';
        } else {
            const commentMap = {};
            const roots = [];

            comments.forEach(c => {
                c.replies = [];
                commentMap[c.id] = c;
                if (c.parent_id) {
                    if (commentMap[c.parent_id]) commentMap[c.parent_id].replies.push(c);
                } else {
                    roots.push(c);
                }
            });

            // Render roots with recursion for replies
            roots.reverse().forEach(root => {
                list.appendChild(renderCommentItem(root, 0));
            });
        }
    } catch (e) { console.error(e); }
}

function renderCommentItem(c, depth) {
    const date = new Date(c.created_at).toLocaleString('ka-GE');
    const div = document.createElement('div');
    div.className = 'comment-item';
    if (depth > 0) div.style.marginLeft = (depth * 30) + 'px';
    if (depth > 0) div.style.borderLeft = '3px solid var(--news-border)';
    if (depth > 0) div.style.paddingLeft = '20px';
    if (depth > 0) div.style.borderRadius = '0 15px 15px 0';

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <span class="comment-user">${c.nickname || 'Unknown'}</span>
            <span class="comment-date">${date}</span>
        </div>
        <p class="comment-text">${c.comment_text}</p>
        <button onclick="replyToComment(${c.id}, '${c.nickname}')" style="background: none; border: none; color: var(--news-primary); font-size: 0.8rem; cursor: pointer; font-weight: 700; padding: 0;">↩ პასუხი</button>
    `;

    const fragment = document.createDocumentFragment();
    fragment.appendChild(div);

    if (c.replies && c.replies.length > 0) {
        c.replies.forEach(reply => {
            fragment.appendChild(renderCommentItem(reply, depth + 1));
        });
    }

    return fragment;
}

window.replyToComment = (id, name) => {
    if (!userEmail) return alert("გთხოვთ გაიაროთ ავტორიზაცია");
    replyingToId = id;
    const input = get('comment-input');
    input.placeholder = `პასუხი ${name}-ს:`;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth' });
};

window.shareNews = () => {
    const url = window.location.origin + window.location.pathname + '?id=' + currentNewsId;
    const modal = document.createElement('div');
    modal.className = 'premium-modal'; // Use existing class if possible, but let's make it inline for safety
    modal.style = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(8px);
    `;
    modal.onclick = () => modal.remove();

    const card = document.createElement('div');
    card.style = `
        background: var(--news-card-bg);
        padding: 40px;
        border-radius: 24px;
        width: 100%;
        max-width: 450px;
        text-align: center;
        border: 1px solid var(--news-border);
        box-shadow: var(--news-shadow);
        animation: dropdownAnim 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    `;
    card.onclick = (e) => e.stopPropagation();

    card.innerHTML = `
        <h2 style="font-weight: 900; margin-bottom: 25px; color: var(--news-text);">🔗 გაზიარება</h2>
        
        <div style="margin-bottom: 25px;">
            <p style="font-size: 0.8rem; color: var(--news-text-dim); text-align: left; margin-bottom: 8px; font-weight: 700;">პირდაპირი ლინკი:</p>
            <div style="display: flex; gap: 10px;">
                <input type="text" id="share-url-input" value="${url}" readonly style="flex: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--news-border); background: var(--news-bg); color: var(--news-text); font-size: 0.9rem;">
                <button id="copy-share-btn" style="padding: 10px 20px; border-radius: 12px; border: none; background: var(--news-primary); color: #fff; cursor: pointer; font-weight: 800;">📋</button>
            </div>
        </div>

        <a href="https://discord.com/channels/@me" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 10px; background: #5865F2; color: #fff; padding: 15px; border-radius: 12px; text-decoration: none; font-weight: 800; transition: transform 0.2s;">
            <span>🎮</span> გაზიარება Discord-ზე
        </a>
        
        <button onclick="this.parentElement.parentElement.remove()" style="margin-top: 20px; background: none; border: none; color: var(--news-text-dim); cursor: pointer; font-weight: 700;">დახურვა</button>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const copyBtn = card.querySelector('#copy-share-btn');
    copyBtn.onclick = () => {
        const input = card.querySelector('#share-url-input');
        input.select();
        document.execCommand('copy');
        copyBtn.textContent = '✅';
        copyBtn.style.background = '#2ecc71';
        setTimeout(() => {
            copyBtn.textContent = '📋';
            copyBtn.style.background = 'var(--news-primary)';
        }, 2000);
    };
};

async function loadLikes(id) {
    try {
        const res = await sql`SELECT COUNT(*) FROM news_likes WHERE news_id = ${id}`;
        get('like-count').textContent = res[0].count;

        if (userEmail) {
            const check = await sql`SELECT id FROM news_likes WHERE news_id = ${id} AND user_email = ${userEmail}`;
            get('like-btn').style.background = check.length > 0 ? '#ff0000' : '#f0f0f0';
            get('like-btn').style.color = check.length > 0 ? '#fff' : '#000';
        }
    } catch (e) { console.error(e); }
}

function setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = (e) => {
            if (link.id === 'login-nav-btn') return;
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            currentCategory = link.textContent;
            showNewsList();
            loadNews();
        };
    });

    get('login-nav-btn').onclick = () => {
        get('auth-modal').classList.remove('hidden');
    };

    get('user-profile-header').onclick = (e) => {
        e.stopPropagation();
        get('profile-dropdown').classList.toggle('active');

        // Update checkbox state in case it was changed elsewhere
        const cb = get('dark-mode-checkbox');
        if (cb) cb.checked = document.body.classList.contains('dark-mode');
    };

    get('dark-mode-toggle').onclick = (e) => {
        e.stopPropagation();
        const cb = get('dark-mode-checkbox');
        const isDark = !document.body.classList.contains('dark-mode');

        if (isDark) {
            document.body.classList.add('dark-mode');
            localStorage.setItem('tilo_dark_mode', 'true');
        } else {
            document.body.classList.remove('dark-mode');
            localStorage.setItem('tilo_dark_mode', 'false');
        }
        if (cb) cb.checked = isDark;
    };

    window.onclick = () => {
        get('profile-dropdown').classList.remove('active');
    };

    get('nav-logout-btn').onclick = () => {
        localStorage.removeItem('tilo_email');
        localStorage.removeItem('tilo_nick');
        location.reload();
    };

    get('profile-btn').onclick = (e) => {
        // Now profile page is separate, but we can keep the old modal for quick edits if needed
        // Or just let the dropdown handle it. User requested separate page.
        e.stopPropagation();
        get('profile-dropdown').classList.toggle('active');
    };

    get('close-auth').onclick = () => get('auth-modal').classList.add('hidden');
    get('close-settings').onclick = () => get('settings-modal').classList.add('hidden');

    get('show-login-btn').onclick = () => {
        get('nick-field').classList.add('hidden');
        get('auth-title').textContent = "შესვლა";
        get('show-login-btn').style.background = "var(--news-primary)";
        get('show-register-btn').style.background = "";
        get('auth-submit-btn').textContent = "შესვლა";
        get('forgot-password-container').classList.remove('hidden');
        get('auth-password').parentElement.classList.remove('hidden');
    };

    get('show-register-btn').onclick = () => {
        get('nick-field').classList.remove('hidden');
        get('auth-title').textContent = "რეგისტრაცია";
        get('show-register-btn').style.background = "var(--news-primary)";
        get('show-login-btn').style.background = "";
        get('auth-submit-btn').textContent = "რეგისტრაცია";
        get('forgot-password-container').classList.add('hidden');
        get('auth-password').parentElement.classList.remove('hidden');
    };

    get('forgot-password-link').onclick = (e) => {
        e.preventDefault();
        get('auth-title').textContent = "პაროლის აღდგენა";
        get('nick-field').classList.add('hidden');
        get('auth-password').parentElement.classList.add('hidden'); // Hide password field
        get('forgot-password-container').classList.add('hidden');
        get('auth-submit-btn').textContent = "გაგზავნა";
        get('show-login-btn').style.background = "";
        get('show-register-btn').style.background = "";
    };

    get('auth-submit-btn').onclick = async () => {
        const title = get('auth-title').textContent;
        let mode = 'login';
        if (title === "რეგისტრაცია") mode = 'reg';
        if (title === "პაროლის აღდგენა") mode = 'recovery';

        const em = get('auth-email').value.trim();
        const pas = get('auth-password').value.trim();
        const nickNode = get('nickname-input');
        const nick = nickNode.value.trim();

        if (!em) return alert("შეიყვანეთ ელ-ფოსტა");

        // Recovery Logic
        if (mode === 'recovery') {
            try {
                // Simulate checking email existence
                const check = await sql`SELECT id FROM users WHERE email = ${em}`;
                if (check.length === 0) return alert("ეს ელ-ფოსტა არ არის რეგისტრირებული");

                // In a real app, send email here. For now, mock it.
                alert(`პაროლის აღდგენის ინსტრუქცია გაგზავნილია ${em}-ზე! (სიმულაცია)`);
                get('show-login-btn').click(); // Back to login
            } catch (e) { alert("შეცდომა: " + e.message); }
            return;
        }

        if (!pas) return alert("შეიყვანეთ პაროლი");

        try {
            if (mode === 'reg') {
                if (!nick) return alert("შეიყვანეთ ნიკნეიმი");

                const checkEm = await sql`SELECT id FROM users WHERE email = ${em}`;
                if (checkEm.length > 0) return alert("ეს ელ-ფოსტა უკვე გამოყენებულია");

                const checkNick = await sql`SELECT id FROM users WHERE nickname = ${nick}`;
                if (checkNick.length > 0) return alert("ეს ნიკნეიმი უკვე დაკავებულია");

                await sql`INSERT INTO users (email, password, nickname) VALUES (${em}, ${pas}, ${nick})`;
                alert("რეგისტრაცია წარმატებით დასრულდა! ახლა შეგიძლიათ შეხვიდეთ.");

                get('show-login-btn').click();
                return;
            }

            // Login Logic
            const res = await sql`SELECT * FROM users WHERE email = ${em} AND password = ${pas}`;
            if (res.length > 0) {
                const user = res[0];
                localStorage.setItem('tilo_email', user.email);
                localStorage.setItem('tilo_nick', user.nickname);
                userEmail = user.email;
                nickname = user.nickname;
                get('auth-modal').classList.add('hidden');
                updateAuthUI();
                if (currentNewsId) {
                    loadComments(currentNewsId);
                    loadLikes(currentNewsId);
                }
            } else {
                alert("მონაცემები არასწორია");
            }
        } catch (e) { alert("შეცდომაა: " + e.message); }
    };

    get('logout-btn').onclick = () => {
        localStorage.removeItem('tilo_email');
        localStorage.removeItem('tilo_nick');
        location.reload();
    };

    get('update-profile-btn').onclick = async () => {
        const newNick = get('edit-nick').value.trim();
        if (!newNick) return;
        try {
            await sql`UPDATE users SET nickname = ${newNick} WHERE email = ${userEmail}`;
            localStorage.setItem('tilo_nick', newNick);
            nickname = newNick;
            alert("წარმატებით განახლდა!");
            get('settings-modal').classList.add('hidden');
            updateAuthUI();
        } catch (e) { alert(e.message); }
    };

    get('like-btn').onclick = async () => {
        if (!userEmail) return alert("გთხოვთ გაიაროთ ავტორიზაცია");
        try {
            const check = await sql`SELECT id FROM news_likes WHERE news_id = ${currentNewsId} AND user_email = ${userEmail}`;
            if (check.length > 0) {
                await sql`DELETE FROM news_likes WHERE news_id = ${currentNewsId} AND user_email = ${userEmail}`;
            } else {
                await sql`INSERT INTO news_likes (news_id, user_email) VALUES (${currentNewsId}, ${userEmail})`;
            }
            loadLikes(currentNewsId);
        } catch (e) { console.error(e); }
    };

    get('submit-comment-btn').onclick = async () => {
        if (!userEmail) return alert("გთხოვთ გაიაროთ ავტორიზაცია");

        // Ban Check
        try {
            const user = await sql`SELECT banned_until FROM users WHERE email = ${userEmail}`;
            if (user[0].banned_until && new Date(user[0].banned_until) > new Date()) {
                const date = new Date(user[0].banned_until).toLocaleString('ka-GE');
                return alert(`თქვენი ანგარიში დაბლოკილია ${date}-მდე!`);
            }
        } catch (e) { console.error(e); }

        const txt = get('comment-input').value.trim();
        if (!txt) return;

        try {
            await sql`INSERT INTO news_comments (news_id, user_email, nickname, comment_text, parent_id) 
                      VALUES (${currentNewsId}, ${userEmail}, ${nickname}, ${txt}, ${replyingToId})`;

            get('comment-input').value = '';
            get('comment-input').placeholder = 'დაწერეთ თქვენი აზრი...';
            replyingToId = null;
            loadComments(currentNewsId);
        } catch (e) { console.error(e); }
    };
}

function stripHtml(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}


// --- VIDEO NOTIFICATION SYSTEM (Port from game.js) ---
let videoChannels = [{ id: 'UCycgfC-1XTtOeMLr5Vz77dg', weight: 100 }];
let allChannelVideos = {};
let videoPopupTimers = [];
let currentVideoId = '';
let hasWatchedOneVideo = false;

async function initVideoSystem() {
    await fetchChannelVideos();
    // Schedule first popup after 5 seconds
    setTimeout(showVideoPopup, 5000);
    // Loop every 5 min
    setInterval(showVideoPopup, 300000);
    setupVideoPlayerDrag();
};

async function fetchChannelVideos() {
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
                console.warn('Video Fetch fail for ' + chId);
            }
        } catch (e) { console.error('Video fetch error for ' + chId, e); }
    }
    allChannelVideos = newAllVideos;
}

window.showVideoPopup = () => {
    if (Object.keys(allChannelVideos).length === 0) return;
    // Don't show if modal is open
    if (get('video-player-modal') && !get('video-player-modal').classList.contains('hidden')) return;

    const activeChannels = videoChannels.filter(ch => allChannelVideos[ch.id] && allChannelVideos[ch.id].length > 0);
    if (activeChannels.length === 0) return;

    // Simple selection since only 1 channel usually
    const videos = allChannelVideos[activeChannels[0].id];
    const vid = videos[Math.floor(Math.random() * videos.length)];

    const popup = get('video-notification');
    const thumb = get('video-thumb');
    const titleOverlay = get('video-notif-title'); // Changed ID in HTML
    const btnWatch = get('btn-watch-here');
    const btnYoutube = get('btn-youtube');

    // Extract ID
    let videoId = vid.guid.split(':')[2];
    if (!videoId && vid.link) {
        try { videoId = new URL(vid.link).searchParams.get('v'); } catch (e) { }
    }
    currentVideoId = videoId;

    if (thumb) thumb.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    if (titleOverlay) titleOverlay.textContent = vid.title;
    if (btnYoutube) btnYoutube.href = vid.link;

    if (btnWatch) {
        btnWatch.onclick = window.watchVideoHere;
        btnWatch.textContent = 'აქ ვუყურებ 👁️';
    }

    if (popup) {
        popup.classList.remove('hidden');
        void popup.offsetWidth; // Trigger reflow
        popup.classList.add('slide-in');

        // Auto hide after 10s
        setTimeout(() => {
            popup.classList.remove('slide-in');
        }, 10000);
    }
};

window.hideVideoPopup = function () {
    const popup = get('video-notification');
    if (popup) popup.classList.remove('slide-in');
};

window.watchVideoHere = function (event) {
    if (event) event.preventDefault();
    const modal = get('video-player-modal');
    const iframe = get('video-iframe');

    if (!iframe || !currentVideoId) return;

    iframe.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1`;
    modal.classList.remove('hidden');
    hideVideoPopup();
};

window.closeVideoPlayer = function () {
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
        }
    }

    function onEnd() {
        isDragging = false;
        isResizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
    }
}

// --- GLOBAL CHAT SYSTEM (Port from game.js) ---
function setupChat() {
    const chatInput = get('chat-input');
    const sendBtn = get('send-chat-btn');

    async function sendMsg() {
        const text = chatInput.value.trim().substring(0, 50);
        if (!text) return;

        let nick = nickname || 'Guest'; // Use 'Guest' if not logged in

        try {
            // Ban Check
            if (userEmail) {
                const check = await sql`SELECT banned_until FROM users WHERE email = ${userEmail}`;
                if (check.length > 0 && check[0].banned_until && new Date(check[0].banned_until) > new Date()) {
                    const date = new Date(check[0].banned_until).toLocaleString('ka-GE');
                    alert(`თქვენ დაბლოკილი ხართ ჩატში ${date}-მდე!`);
                    return;
                }
            }

            await sql`INSERT INTO chat_messages(nickname, message) VALUES(${nick}, ${text})`;
            chatInput.value = '';
            fetchChat();
        } catch (e) { console.error("Chat send error:", e); }
    }

    if (sendBtn) sendBtn.onclick = sendMsg;
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };

    // Initial fetch and interval
    fetchChat();
    setInterval(fetchChat, 3000);
}

async function fetchChat() {
    try {
        const msgs = await sql`
            SELECT DISTINCT ON (cm.id) cm.*
            FROM chat_messages cm
            LEFT JOIN users u ON cm.nickname = u.nickname
            WHERE cm.created_at > NOW() - INTERVAL '30 seconds'
              AND cm.nickname != 'SYSTEM_LOG'
            ORDER BY cm.id, cm.created_at ASC
        `;
        const container = get('chat-messages');
        if (!container) return;

        container.innerHTML = '';
        if (msgs.length === 0) {
            container.innerHTML = '<p style="text-align: center; opacity: 0.5; font-size: 0.8rem; margin-top: 20px;">ჩატი ცარიელია...</p>';
            return;
        }

        msgs.forEach(m => {
            const el = document.createElement('div');
            el.className = 'chat-msg'; // Styled in news.css
            // Simple sanitization
            const cleanMsg = m.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const cleanNick = m.nickname.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            el.innerHTML = `<strong style="color: var(--news-primary);">${cleanNick}:</strong> ${cleanMsg}`;
            container.appendChild(el);
        });
        container.scrollTop = container.scrollHeight;
    } catch (e) { console.error("Chat fetch error:", e); }
}

init();
