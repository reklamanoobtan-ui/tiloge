import { neon } from 'https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.9.4/+esm';

const DB_URL = "postgresql://neondb_owner:npg_NBPsUe3FXb4o@ep-calm-wildflower-aim8iczt-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DB_URL);

let userEmail = localStorage.getItem('tilo_email');
let nickname = localStorage.getItem('tilo_nick');
let currentNewsId = null;
let currentCategory = null;

const get = id => document.getElementById(id);

async function init() {
    updateAuthUI();
    loadNews();
    setupEventListeners();

    // Check for direct news link
    const params = new URLSearchParams(window.location.search);
    const newsId = params.get('id');
    if (newsId) {
        setTimeout(() => openNews(newsId), 500);
    }
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

async function loadNews() {
    try {
        let news;
        if (currentCategory && currentCategory !== 'მთავარი') {
            news = await sql`SELECT * FROM news WHERE category = ${currentCategory} ORDER BY created_at DESC`;
        } else {
            news = await sql`SELECT * FROM news ORDER BY created_at DESC`;
        }
        renderNewsGrid(news);
        renderSidebarNews(news);
    } catch (e) {
        console.error("News Load Error:", e);
    }
}

function renderNewsGrid(news) {
    const grid = get('news-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (news.length === 0) {
        grid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 50px; opacity: 0.5;">სიახლეები ჯერ არ არის.</p>';
        return;
    }

    news.forEach(item => {
        const card = document.createElement('div');
        card.className = 'news-card';
        card.onclick = () => openNews(item.id);

        const date = new Date(item.created_at).toLocaleDateString('ka-GE');
        const img = item.image_url || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1000';

        card.innerHTML = `
            <img src="${img}" class="news-img" alt="${item.title}">
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
}

function renderSidebarNews(news) {
    const sidebar = get('sidebar-news-list');
    if (!sidebar) return;
    sidebar.innerHTML = '';

    news.slice(0, 10).forEach(item => {
        const time = new Date(item.created_at).getHours() + ":" + (new Date(item.created_at).getMinutes() < 10 ? '0' : '') + new Date(item.created_at).getMinutes();
        const el = document.createElement('div');
        el.className = 'sidebar-item';
        el.onclick = () => openNews(item.id);

        const img = item.image_url || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80&w=1000';

        el.innerHTML = `
            <img src="${img}">
            <div class="sidebar-item-info">
                <span class="sidebar-item-time">${time}</span>
                <div class="sidebar-item-title">${item.title}</div>
            </div>
        `;
        sidebar.appendChild(el);
    });
}

async function openNews(id) {
    currentNewsId = id;
    get('hero-section').classList.add('hidden');
    get('news-grid').classList.add('hidden');
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
            visualContent = `<img src="${item.image_url}" style="width: 100%; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">`;
        }

        get('detail-content').innerHTML = `
            <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 20px;">${item.title}</h1>
            <div style="font-size: 0.9rem; color: #888; margin-bottom: 30px;">
                ავტორი: <strong>${item.author}</strong> • გამოქვეყნდა: ${date} • კატეგორია: ${item.category}
            </div>
            ${visualContent}
            <div style="line-height: 1.8; font-size: 1.1rem; color: #333;">${item.content}</div>
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
    get('hero-section').classList.remove('hidden');
    get('news-grid').classList.remove('hidden');
    get('news-detail').classList.add('hidden');
    currentNewsId = null;
};

async function loadComments(id) {
    const list = get('comments-list');
    list.innerHTML = '<p style="opacity:0.5;">იტვირთება...</p>';
    try {
        const comments = await sql`SELECT * FROM news_comments WHERE news_id = ${id} ORDER BY created_at DESC`;
        list.innerHTML = '';
        if (comments.length === 0) {
            list.innerHTML = '<p style="opacity:0.5;">კომენტარები ჯერ არ არის.</p>';
        } else {
            comments.forEach(c => {
                const date = new Date(c.created_at).toLocaleString('ka-GE');
                const div = document.createElement('div');
                div.className = 'comment-item';
                div.innerHTML = `
                    <span class="comment-user">${c.nickname || 'Unknown'}</span>
                    <span class="comment-date">${date}</span>
                    <p class="comment-text">${c.comment_text}</p>
                `;
                list.appendChild(div);
            });
        }
    } catch (e) { console.error(e); }
}

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
    };

    get('show-register-btn').onclick = () => {
        get('nick-field').classList.remove('hidden');
        get('auth-title').textContent = "რეგისტრაცია";
        get('show-register-btn').style.background = "var(--news-primary)";
        get('show-login-btn').style.background = "";
    };

    get('auth-submit-btn').onclick = async () => {
        const mode = get('auth-title').textContent === "რეგისტრაცია" ? 'reg' : 'login';
        const em = get('auth-email').value.trim();
        const pas = get('auth-password').value.trim();
        const nickNode = get('nickname-input');
        const nick = nickNode.value.trim();

        if (!em || !pas) return alert("შეავსეთ ველები");

        try {
            if (mode === 'reg') {
                if (!nick) return alert("შეიყვანეთ ნიკნეიმი");

                // Fix: Check if exists
                const checkEm = await sql`SELECT id FROM users WHERE email = ${em}`;
                if (checkEm.length > 0) return alert("ეს ელ-ფოსტა უკვე გამოყენებულია");

                const checkNick = await sql`SELECT id FROM users WHERE nickname = ${nick}`;
                if (checkNick.length > 0) return alert("ეს ნიკნეიმი უკვე დაკავებულია");

                await sql`INSERT INTO users (email, password, nickname) VALUES (${em}, ${pas}, ${nick})`;
                alert("რეგისტრაცია წარმატებით დასრულდა! ახლა შეგიძლიათ შეხვიდეთ.");

                // Switch to login
                get('show-login-btn').click();
                return;
            }

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
        const txt = get('comment-input').value.trim();
        if (!txt) return;

        try {
            await sql`INSERT INTO news_comments (news_id, user_email, nickname, comment_text) VALUES (${currentNewsId}, ${userEmail}, ${nickname}, ${txt})`;
            get('comment-input').value = '';
            loadComments(currentNewsId);
        } catch (e) { console.error(e); }
    };
}

function stripHtml(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

init();
