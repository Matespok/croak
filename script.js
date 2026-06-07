const API = 'https://matespok.serveousercontent.com/api';

        const state = {
            token: localStorage.getItem('token'),
            userId: localStorage.getItem('userId'),
            username: localStorage.getItem('username'),
            view: 'home',
            params: {},
            userCache: {},
            profileTab: 'posts'
        };

        function openMobileMenu() {
            document.getElementById('mobileMenu').classList.add('open');
            document.getElementById('menuOverlay').classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileMenu() {
            document.getElementById('mobileMenu').classList.remove('open');
            document.getElementById('menuOverlay').classList.remove('open');
            document.body.style.overflow = '';
        }

        // ========================
        // PWA instalace
        // ========================
        let deferredPrompt = null;
        const installToast = document.getElementById('installToast');
        let toastTimeout = null;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installToast.classList.add('show');
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                installToast.classList.remove('show');
            }, 10000);
        });

        installToast.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Instalace: ${outcome}`);
            deferredPrompt = null;
            installToast.classList.remove('show');
        });

        // ========================
        // Online/Offline detekce
        // ========================
        function updateOfflineStatus() {
            const badge = document.getElementById('offlineBadge');
            if (!navigator.onLine) {
                badge.classList.add('show');
            } else {
                badge.classList.remove('show');
            }
        }
        window.addEventListener('online', updateOfflineStatus);
        window.addEventListener('offline', updateOfflineStatus);
        updateOfflineStatus();

        // ========================
        // Service Worker registrace
        // ========================
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('SW registered:', reg))
                .catch(err => console.log('SW error:', err));
        }

        const ux = {
            getAvatarColor(name) {
                const colors = ['#8b9a6e', '#9e8f6e', '#7a8e7a', '#8e7c6b', '#a09070', '#6e7d6e'];
                if(!name) return colors[0];
                let hash = 0;
                for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
                return colors[Math.abs(hash) % colors.length];
            },
            avatar(name, userId) {
                const safeName = name || '?';
                return `<div class="avatar shadow-sm cursor-pointer hover:opacity-85 transition-opacity" style="background-color: ${this.getAvatarColor(safeName)};" onclick="event.stopPropagation(); router.navigate('profile', {id: ${userId}})">${safeName[0].toUpperCase()}</div>`;
            }
        };

        const utils = {
            async getUsername(id) {
                if(state.userCache[id]) return state.userCache[id];
                try {
                    const user = await api.get(`/user/${id}`);
                    state.userCache[id] = user.username;
                    return user.username;
                } catch { return `User_${id}`; }
            },
            formatDate(dateStr) {
                if(!dateStr) return '';
                const date = new Date(dateStr);
                return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            },
            pluralizeComments(count) {
                if(count === 0) return 'Odpovědět';
                if(count === 1) return '1 odpověď';
                if(count > 1 && count < 5) return `${count} odpovědi`;
                return `${count} odpovědí`;
            }
        };

        const router = {
            navigate(view, params = {}) {
                state.view = view;
                state.params = params;
                if(view === 'profile') state.profileTab = 'posts';
                this.render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                closeMobileMenu();
            },
            async render() {
                const app = document.getElementById('app');
                const deskNav = document.getElementById('desktop-nav');
                const mobNav = document.getElementById('mobile-menu-nav');
                
                const desktopContent = state.token ? `
                    <div class="flex flex-col gap-0 w-full">
                        <button onclick="router.navigate('home')" class="sidebar-link flex items-center gap-3 px-4 py-3 text-sm font-light text-gray-300 w-full text-left hover:text-white transition-colors">⌂ Feed</button>
                        <button onclick="router.navigate('profile', {id: ${state.userId}})" class="sidebar-link flex items-center gap-3 px-4 py-3 text-sm font-light text-gray-300 w-full text-left hover:text-white transition-colors">○ Profil</button>
                    </div>
                    <div class="mt-auto mb-3 pt-5 border-t border-white/10">
                        <div class="flex items-center gap-3 px-4 py-2 mb-4">
                            ${ux.avatar(state.username, state.userId)}
                            <div><div class="font-light text-sm text-white">${state.username}</div></div>
                        </div>
                        <button onclick="actions.logout()" class="w-full text-left px-4 py-2 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">Odhlásit</button>
                    </div>
                ` : `
                    <button onclick="router.navigate('home')" class="sidebar-link flex items-center gap-3 px-4 py-3 text-sm font-light text-gray-300 w-full text-left hover:text-white">⌂ Prozkoumat</button>
                    <div class="mt-auto px-4 py-5">
                        <button onclick="router.navigate('login')" class="w-full btn-primary py-2 text-xs">Přihlásit</button>
                    </div>
                `;
                deskNav.innerHTML = desktopContent;
                mobNav.innerHTML = desktopContent;

                app.innerHTML = `<div class="flex justify-center py-20"><div class="loader"></div></div>`;
                
                try {
                    switch(state.view) {
                        case 'home': await views.home(app); break;
                        case 'login': views.login(app); break;
                        case 'post': await views.postDetail(app, state.params.id); break;
                        case 'profile': await views.profile(app, state.params.id); break;
                    }
                } catch (err) {
                    app.innerHTML = `<div class="p-12 text-center"><p class="serif-text text-gray-500 text-sm">${err.message}</p></div>`;
                }
            }
        };

        const views = {
            async home(container) {
                const posts = await api.get('/posts');
                
                let html = `<div class="px-5 py-4 border-b border-[#e6e2da] sticky top-0 bg-[#f5f3ef]/95 backdrop-blur-sm z-30"><h2 class="text-xs font-light tracking-[0.2em] uppercase text-gray-500">Vlákna</h2></div>`;

                if (state.token) {
                    html += `
                        <div class="p-5 border-b border-[#e6e2da] bg-[#f5f3ef] flex gap-3">
                            ${ux.avatar(state.username, state.userId)}
                            <div class="flex-grow">
                                <input id="new-topic" type="text" placeholder="Nadpis diskuze..." class="feed-input text-base font-medium mb-2 placeholder:text-gray-300">
                                <textarea id="new-content" placeholder="Co máte na mysli?" class="feed-input serif-text text-gray-600 text-sm h-16 placeholder:text-gray-300" oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 110) + 'px'"></textarea>
                                <div class="flex justify-end mt-3 pt-2"><button onclick="actions.createPost()" class="btn-primary text-xs py-1.5 px-5">Publikovat</button></div>
                            </div>
                        </div>
                    `;
                }

                if (posts.length === 0) {
                    html += `<div class="p-12 text-center"><p class="serif-text text-gray-400 italic text-sm">Zatím tu nic není.</p></div>`;
                } else {
                    const postsHtml = await Promise.all(posts.map(async p => {
                        const authorName = p.authorName || p.AuthorName || await utils.getUsername(p.userId);
                        const id = p.id || p.postId || p.PostId;
                        const formattedDate = utils.formatDate(p.createdAt || p.CreatedAt);
                        let commentCount = 0;
                        try { const postComments = await api.get(`/comments/${id}`); commentCount = postComments.length; } catch(e) {}

                        return `
                            <article class="post-card px-5 py-5 bg-[#f5f3ef]" onclick="router.navigate('post', {id: ${id}})">
                                <div class="flex gap-3">
                                    ${ux.avatar(authorName, p.userId)}
                                    <div class="flex-grow">
                                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                                            <span class="font-medium text-sm hover:underline cursor-pointer text-gray-700" onclick="event.stopPropagation(); router.navigate('profile', {id: ${p.userId}})">${authorName}</span>
                                            <span class="text-gray-400 text-[11px]">·</span>
                                            <span class="text-gray-400 text-[11px]">${formattedDate}</span>
                                        </div>
                                        <h3 class="text-base font-medium text-gray-800 mb-1 leading-tight">${p.topic || p.Topic}</h3>
                                        <p class="text-gray-500 leading-relaxed line-clamp-3 serif-text text-sm">${(p.content || p.Content).substring(0, 260)}${(p.content || p.Content).length > 260 ? '…' : ''}</p>
                                        <div class="mt-3">
                                            <div class="action-icon gap-1.5">
                                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                                                <span>${utils.pluralizeComments(commentCount)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        `;
                    }));
                    html += postsHtml.join('');
                }
                container.innerHTML = html;
            },

            login(container) {
                container.innerHTML = `
                    <div class="p-4 border-b border-[#e6e2da] bg-[#f5f3ef]"><button onclick="router.navigate('home')" class="text-sm text-gray-500 hover:text-gray-700">← Zpět</button></div>
                    <div class="max-w-sm mx-auto mt-16 p-8 bg-[#f5f3ef]">
                        <div class="text-center mb-8"><h2 class="text-base font-light tracking-wide uppercase text-gray-500">Vstup</h2></div>
                        <div class="space-y-5">
                            <div>
                                <label class="block text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">Uživatelské jméno</label>
                                <input id="auth-uname" type="text" class="w-full bg-transparent border-b border-[#e6e2da] p-2 focus:outline-none focus:border-gray-400 text-sm" oninput="actions.checkUser(this.value)">
                                <div id="user-hint" class="text-[9px] mt-1 h-3 text-right"></div>
                            </div>
                            <div>
                                <label class="block text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">Heslo</label>
                                <input id="auth-pass" type="password" class="w-full bg-transparent border-b border-[#e6e2da] p-2 focus:outline-none focus:border-gray-400 text-sm">
                            </div>
                            <div class="pt-4 space-y-3">
                                <button onclick="actions.login()" class="btn-primary w-full py-2 text-sm">Přihlásit se</button>
                                <button onclick="actions.register()" class="btn-outline w-full py-2 text-sm">Registrovat</button>
                            </div>
                        </div>
                    </div>
                `;
            },

            async postDetail(container, id) {
                const post = await api.get(`/posts/${id}`);
                const comments = await api.get(`/comments/${id}`);
                const authorName = post.authorName || post.AuthorName || await utils.getUsername(post.userId);
                const formattedDate = utils.formatDate(post.createdAt || post.CreatedAt);

                let html = `
                    <div class="px-4 py-3 border-b border-[#e6e2da] sticky top-0 bg-[#f5f3ef]/95 backdrop-blur-sm z-30 flex items-center gap-4">
                        <button onclick="router.navigate('home')" class="text-gray-500 hover:text-gray-700 text-lg">←</button>
                        <h2 class="text-[10px] font-light tracking-[0.2em] uppercase text-gray-500">Vlákno</h2>
                    </div>
                    <article class="p-5 border-b border-[#e6e2da]">
                        <div class="flex items-center gap-3 mb-4">
                            ${ux.avatar(authorName, post.userId)}
                            <div>
                                <div class="font-medium text-sm hover:underline cursor-pointer text-gray-700" onclick="router.navigate('profile', {id: ${post.userId}})">${authorName}</div>
                                <div class="text-gray-400 text-[11px]">@${authorName.toLowerCase()}</div>
                            </div>
                        </div>
                        <h1 class="text-xl font-medium mb-3 tracking-tight">${post.topic || post.Topic}</h1>
                        <p class="text-gray-600 whitespace-pre-wrap mb-5 serif-text leading-relaxed text-sm">${post.content || post.Content}</p>
                        <div class="pt-3 text-[11px] text-gray-400 border-t border-[#e6e2da]">${formattedDate} &bull; ${comments.length} odpovědí</div>
                    </article>
                `;

                if(state.token) {
                    html += `
                        <div class="p-5 bg-[#faf8f4] flex gap-3">
                            ${ux.avatar(state.username, state.userId)}
                            <div class="flex-grow">
                                <textarea id="comm-content" placeholder="Napište odpověď..." class="feed-input serif-text text-gray-600 text-sm h-14 placeholder:text-gray-300" oninput="this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 90) + 'px'"></textarea>
                                <div class="flex justify-end mt-2"><button onclick="actions.addComment(${id})" class="btn-primary text-xs py-1.5 px-4">Odpovědět</button></div>
                            </div>
                        </div>
                    `;
                }

                if(comments.length === 0) {
                    html += `<div class="p-10 text-center"><p class="serif-text text-gray-400 italic text-sm">Buďte první.</p></div>`;
                } else {
                    html += comments.map(c => {
                        const cAuthor = c.authorName || c.AuthorName;
                        return `
                            <div class="p-5 border-b border-[#f0ede8] flex gap-3 hover:bg-[#faf8f4]/50">
                                ${ux.avatar(cAuthor, c.userId)}
                                <div class="flex-grow">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="font-medium text-sm hover:underline cursor-pointer text-gray-700" onclick="router.navigate('profile', {id: ${c.userId}})">${cAuthor}</span>
                                        <span class="text-gray-400 text-[10px]">· ${utils.formatDate(c.commentedAt || c.CommentedAt)}</span>
                                    </div>
                                    <p class="text-gray-500 serif-text text-sm leading-relaxed">${c.content || c.Content}</p>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
                container.innerHTML = html;
            },

            async profile(container, id) {
                const user = await api.get(`/user/${id}`);
                const userPosts = await api.get(`/posts/user/${id}`);
                const userComments = await api.get(`/comments/users/${id}`);
                const displayUsername = user.username || await utils.getUsername(id);

                let activityHtml = '';
                if (state.profileTab === 'posts') {
                    activityHtml = userPosts.length === 0 
                        ? `<div class="p-10 text-center"><p class="serif-text text-gray-400 italic text-sm">Žádná témata.</p></div>`
                        : userPosts.map(p => `
                            <article class="post-card px-5 py-5" onclick="router.navigate('post', {id: ${p.id || p.postId || p.PostId}})">
                                <div class="flex gap-3">
                                    ${ux.avatar(displayUsername, p.userId)}
                                    <div class="flex-grow">
                                        <div class="flex items-center gap-2 text-gray-400 text-[10px] mb-1">
                                            <span class="font-medium text-gray-700">${displayUsername}</span> · ${utils.formatDate(p.createdAt || p.CreatedAt)}
                                        </div>
                                        <h3 class="text-base font-medium text-gray-800 mb-1">${p.topic || p.Topic}</h3>
                                        <p class="text-gray-500 serif-text text-sm line-clamp-2">${p.content || p.Content}</p>
                                    </div>
                                </div>
                            </article>
                        `).join('');
                } else {
                    activityHtml = userComments.length === 0 
                        ? `<div class="p-10 text-center"><p class="serif-text text-gray-400 italic text-sm">Žádné odpovědi.</p></div>`
                        : userComments.map(c => `
                            <article class="post-card px-5 py-5" onclick="router.navigate('post', {id: ${c.postId || c.PostId}})">
                                <div class="flex gap-3">
                                    ${ux.avatar(displayUsername, id)}
                                    <div class="flex-grow">
                                        <div class="flex items-center gap-2 text-gray-400 text-[10px] mb-1">
                                            <span class="font-medium text-gray-700">${displayUsername}</span> · ${utils.formatDate(c.commentedAt || c.CommentedAt)}
                                        </div>
                                        <div class="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Odpověď ve vláknu #${c.postId || c.PostId}</div>
                                        <p class="text-gray-500 serif-text text-sm">${c.content || c.Content}</p>
                                    </div>
                                </div>
                            </article>
                        `).join('');
                }

                container.innerHTML = `
                    <div class="px-4 py-3 border-b border-[#e6e2da] sticky top-0 bg-[#f5f3ef]/95 backdrop-blur-sm z-30 flex items-center gap-6">
                        <button onclick="router.navigate('home')" class="text-gray-500 hover:text-gray-700">←</button>
                        <div><h2 class="text-[10px] font-light tracking-[0.2em] uppercase text-gray-500">${displayUsername}</h2></div>
                    </div>
                    <div class="h-20 bg-gradient-to-r from-gray-100 to-gray-200/40"></div>
                    <div class="px-5 pb-4 border-b border-[#e6e2da] relative">
                        <div class="w-16 h-16 rounded-full border-2 border-[#f5f3ef] absolute -top-8 flex items-center justify-center text-xl font-light text-white shadow-sm" style="background-color: ${ux.getAvatarColor(displayUsername)}">${displayUsername[0]}</div>
                        <div class="flex justify-end pt-2 mb-2">${state.token && state.userId == id ? `<button onclick="actions.logout()" class="text-[10px] text-gray-400 hover:text-gray-600">Odhlásit</button>` : `<div class="h-3"></div>`}</div>
                        <h2 class="text-lg font-medium mt-3">${displayUsername}</h2>
                        <div class="flex gap-4 text-[11px] text-gray-500 mt-1">
                            <div><span class="font-medium text-gray-600">${userPosts.length}</span> témat</div>
                            <div><span class="font-medium text-gray-600">${userComments.length}</span> odpovědí</div>
                        </div>
                    </div>
                    <div class="flex border-b border-[#e6e2da] bg-[#f5f3ef] sticky top-[57px] z-20">
                        <div class="flex-1 text-center text-[10px] font-light uppercase tracking-[0.15em] py-3 cursor-pointer ${state.profileTab === 'posts' ? 'border-b border-gray-400 text-gray-700' : 'text-gray-400'}" onclick="actions.switchProfileTab('posts')">Témata</div>
                        <div class="flex-1 text-center text-[10px] font-light uppercase tracking-[0.15em] py-3 cursor-pointer ${state.profileTab === 'comments' ? 'border-b border-gray-400 text-gray-700' : 'text-gray-400'}" onclick="actions.switchProfileTab('comments')">Odpovědi</div>
                    </div>
                    <div>${activityHtml}</div>
                `;
            }
        };

        const api = {
            async get(endpoint) {
                const headers = state.token ? { 'Authorization': `Bearer ${state.token}` } : {};
                const res = await fetch(`${API}${endpoint}`, { headers });
                if(!res.ok) throw new Error(`API chyba při stahování: ${res.status}`);
                try { return await res.json(); } catch { return []; }
            },
            async post(endpoint, params = {}) {
                const query = new URLSearchParams(params).toString();
                return await fetch(`${API}${endpoint}?${query}`, {
                    method: 'POST',
                    headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
                });
            }
        };

        const actions = {
            switchProfileTab(tab) { state.profileTab = tab; router.render(); },
            logout() { localStorage.clear(); location.reload(); },
            async checkUser(uname) {
                if(uname.length < 3) return;
                try {
                    const exists = await (await fetch(`${API}/user/exists?uname=${uname}`)).json();
                    document.getElementById('user-hint').innerHTML = exists ? '<span class="text-red-300 text-[9px]">zabrané</span>' : '<span class="text-emerald-600 text-[9px]">volné</span>';
                } catch(e){}
            },
            async login() {
                const uname = document.getElementById('auth-uname').value;
                const pass = document.getElementById('auth-pass').value;
                try {
                    const res = await fetch(`${API}/user/authenticate?uname=${uname}&pass=${pass}`);
                    if (res.ok) {
                        const data = await res.json();
                        Object.assign(state, data);
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('userId', data.userId);
                        localStorage.setItem('username', data.username);
                        router.navigate('home');
                    } else alert("Chybné přihlášení (Spatné jméno nebo heslo).");
                } catch(e) { alert("Chyba serveru při přihlašování."); }
            },
            async register() {
                const uname = document.getElementById('auth-uname').value;
                const pass = document.getElementById('auth-pass').value;
                try {
                    const res = await api.post('/user', { uname, password: pass });
                    if (res.ok) alert("Účet vytvořen, můžete se přihlásit.");
                    else alert(`Registrace selhala. Status: ${res.status}`);
                } catch(e) { alert("Chyba serveru při registraci."); }
            },
            async createPost() {
                const topic = document.getElementById('new-topic').value;
                const content = document.getElementById('new-content').value;
                if(!topic || !content) return;
                try { 
                    const res = await api.post('/posts', { topic, content }); 
                    if (res.ok) {
                        router.render(); 
                    } else {
                        alert(`Chyba serveru při vytváření příspěvku: Status ${res.status}`);
                    }
                } catch(e) {
                    alert("Síťová chyba při vytváření příspěvku.");
                    console.error(e);
                }
            },
            async addComment(postId) {
                const content = document.getElementById('comm-content').value;
                if(!content) return;
                try { 
                    const res = await api.post('/comments', { postId, content }); 
                    if (res.ok) {
                        router.render(); 
                    } else {
                        alert(`Chyba serveru při přidávání komentáře: Status ${res.status}`);
                    }
                } catch(e) {
                    alert("Síťová chyba při přidávání komentáře.");
                    console.error(e);
                }
            }
        };

        router.render();