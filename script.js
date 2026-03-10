// ========= Общая логика приложения =========
// všechny data uložíme do LocalStorage:
// users:    [{ id, username, email, passwordHash, bio, avatarBase64, createdAt }]
// posts:    [{ id, userId, content, fileBase64, fileName, createdAt, likes: [userId, ...] }]
// followers:[{ followerId, followingId }]
//
// LocalStorage ukládá data jako řetězce, takže
// JSON.stringify při ukládání
// a JSON.parse při čtení.

const STORAGE_KEYS = {
  USERS: 'users',
  POSTS: 'posts',
  FOLLOWERS: 'followers',
  CURRENT_USER_ID: 'currentUserId'
};

// безопасно získáme объект překladů, pokud je translations.js připojen
const I18n = window.I18n || {
  t: (k) => k,
  getLanguage: () => 'cs',
  setLanguage: () => {},
  apply: () => {}
};

// Jednoduchá hašovací funkce pro heslo
// Heslo se explicitně neukládá,
// ale vypočítáme pro něj „hash“ a porovnáme hashe.
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function loadArray(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function initStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    saveArray(STORAGE_KEYS.USERS, []);
  }
  if (!localStorage.getItem(STORAGE_KEYS.POSTS)) {
    saveArray(STORAGE_KEYS.POSTS, []);
  }
  if (!localStorage.getItem(STORAGE_KEYS.FOLLOWERS)) {
    saveArray(STORAGE_KEYS.FOLLOWERS, []);
  }
}


function getCurrentUserId() {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
}

function setCurrentUserId(id) {
  if (id === null || id === undefined) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  } else {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, String(id));
  }
}

function getUsers() {
  return loadArray(STORAGE_KEYS.USERS);
}

function saveUsers(users) {
  saveArray(STORAGE_KEYS.USERS, users);
}

function getPosts() {
  return loadArray(STORAGE_KEYS.POSTS);
}

function savePosts(posts) {
  saveArray(STORAGE_KEYS.POSTS, posts);
}

function getFollowers() {
  return loadArray(STORAGE_KEYS.FOLLOWERS);
}

function saveFollowers(followers) {
  saveArray(STORAGE_KEYS.FOLLOWERS, followers);
}

function findUserById(userId) {
  const users = getUsers();
  return users.find(u => String(u.id) === String(userId)) || null;
}

function findUserByUsernameOrEmail(identifier) {
  const users = getUsers();
  const lower = identifier.trim().toLowerCase();
  return users.find(
    u =>
      u.username.toLowerCase() === lower ||
      u.email.toLowerCase() === lower
  ) || null;
}

// ========= Registrace a login =========

function handleRegister(event) {
  event.preventDefault();

  const usernameInput = document.getElementById('regUsername');
  const emailInput = document.getElementById('regEmail');
  const passwordInput = document.getElementById('regPassword');
  const errorEl = document.getElementById('registerError');

  if (!usernameInput || !emailInput || !passwordInput || !errorEl) return;

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!username || !email || !password) {
    errorEl.textContent = I18n.t('error_fill_all');
    return;
  }

  if (password.length < 8) {
    errorEl.textContent = I18n.t('error_password_short');
    return;
  }

  const users = getUsers();

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    errorEl.textContent = I18n.t('error_username_exists');
    return;
  }
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    errorEl.textContent = I18n.t('error_email_exists');
    return;
  }

  const newUser = {
    id: Date.now(), // unikátní id
    username,
    email,
    passwordHash: simpleHash(password), // zde ukládáme HASH, ne heslo
    bio: '',
    avatarBase64: null,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  // автоматический login
  setCurrentUserId(newUser.id);

  // přechod na feed
  window.location.href = 'feed.html';
}

function handleLogin(event) {
  event.preventDefault();

  const identifierInput = document.getElementById('loginIdentifier');
  const passwordInput = document.getElementById('loginPassword');
  const errorEl = document.getElementById('loginError');

  if (!identifierInput || !passwordInput || !errorEl) return;

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!identifier || !password) {
    errorEl.textContent = I18n.t('error_login_fields');
    return;
  }

  // najdeme uživatele podle username nebo email
  const user = findUserByUsernameOrEmail(identifier);
  if (!user) {
    errorEl.textContent = I18n.t('error_user_not_found');
    return;
  }

  // porovnáme hashy hesel
  const enteredHash = simpleHash(password);
  if (enteredHash !== user.passwordHash) {
    errorEl.textContent = I18n.t('error_wrong_password');
    return;
  }

  // úspěch: uložíme currentUserId do LocalStorage
  setCurrentUserId(user.id);
  window.location.href = 'feed.html';
}

function handleLogout() {
  setCurrentUserId(null);
  window.location.href = 'index.html';
}

// ========= Příspěvky a lajky =========

function createPost(userId, content, fileData) {
  const posts = getPosts();
  const newPost = {
    id: Date.now(),
    userId: userId,
    content: content.trim(),
    fileBase64: fileData ? fileData.base64 : null,
    fileName: fileData ? fileData.name : null,
    createdAt: new Date().toISOString(),
    likes: [] // pole id uživatelů, kteří lajkovali
  };
  posts.unshift(newPost); // přidáme na začátek, aby nové příspěvky byly nahoře
  savePosts(posts);
}

function deletePost(postId, currentUserId) {
  let posts = getPosts();
  const post = posts.find(p => String(p.id) === String(postId));
  if (!post) return;
  if (String(post.userId) !== String(currentUserId)) {
    // nemůžete smazat příspěvek jiného uživatele
    return;
  }
  posts = posts.filter(p => String(p.id) !== String(postId));
  savePosts(posts);
}


function toggleLike(postId, userId) {
  const posts = getPosts();
  const post = posts.find(p => String(p.id) === String(postId));
  if (!post) return;

  const alreadyLiked = post.likes.includes(userId);
  if (alreadyLiked) {
    post.likes = post.likes.filter(id => id !== userId);
  } else {
    post.likes.push(userId);
  }
  savePosts(posts);
}

// ========= Přihlášení =========

// followerId  — kdo se přihlásí
// followingId — na koho se přihlásí

function isFollowing(followerId, followingId) {
  const followers = getFollowers();
  return followers.some(
    f =>
      String(f.followerId) === String(followerId) &&
      String(f.followingId) === String(followingId)
  );
}

function follow(followerId, followingId) {
  if (String(followerId) === String(followingId)) return; // Нельзя подписаться на себя
  const followers = getFollowers();
  if (isFollowing(followerId, followingId)) return;
  followers.push({ followerId, followingId });
  saveFollowers(followers);
}

function unfollow(followerId, followingId) {
  let followers = getFollowers();
  followers = followers.filter(
    f =>
      !(
        String(f.followerId) === String(followerId) &&
        String(f.followingId) === String(followingId)
      )
  );
  saveFollowers(followers);
}

function countFollowers(userId) {
  const followers = getFollowers();
  return followers.filter(f => String(f.followingId) === String(userId)).length;
}

function countFollowing(userId) {
  const followers = getFollowers();
  return followers.filter(f => String(f.followerId) === String(userId)).length;
}

// ========= Algoritmus doporučení =========
// Doporučení: uživatelé s společnými přihlášeními + populární uživatelé.
// 1) Vezmeme všechny uživatele, kromě:
//    - aktuálního uživatele
//    - těch, na koho je již přihlásen
// 2) Pro každého vypočítáme "score":
//    - + počet společných přihlášení (my podíváme se na stejné lidi)
//    - + počet jeho sledujících (popularita)
// 3) Seřadíme podle score sestupně a vezmeme TOP N.

function getRecommendations(currentUserId, limit = 5) {
  const users = getUsers();
  const followers = getFollowers();

  const currentUserFollowing = followers
    .filter(f => String(f.followerId) === String(currentUserId))
    .map(f => String(f.followingId));

  const candidates = users.filter(u => {
    const isCurrent = String(u.id) === String(currentUserId);
    const alreadyFollowing = currentUserFollowing.includes(String(u.id));
    return !isCurrent && !alreadyFollowing;
  });

  const scores = candidates.map(u => {
    const userFollowing = followers
      .filter(f => String(f.followerId) === String(u.id))
      .map(f => String(f.followingId));

    // общие подписки
    const commonFollowing = userFollowing.filter(id =>
      currentUserFollowing.includes(id)
    ).length;

    // популярность — число подписчиков
    const followersCount = countFollowers(u.id);

    const score = commonFollowing * 2 + followersCount;
    return { user: u, score };
  });

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, limit).map(s => s.user);
}

// ========= Вспомогательные функции UI =========

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function userAvatarHTML(user) {
  if (user.avatarBase64) {
    return `<img src="${user.avatarBase64}" alt="${escapeHtml(user.username)}">`;
  }
  const letter = user.username ? user.username.charAt(0).toUpperCase() : '?';
  return escapeHtml(letter);
}

// Отрисовка поста (общая для ленты и профилей)
function renderPost(post, currentUserId) {
  const author = findUserById(post.userId);
  const likesCount = post.likes.length;
  const likedByCurrent = post.likes.includes(currentUserId);
  const canDelete = String(post.userId) === String(currentUserId);

  const div = document.createElement('div');
  div.className = 'post';
  div.dataset.postId = post.id;

  const likesWord = I18n.t('likes_word');
  const likeText = likedByCurrent ? I18n.t('unlike') : I18n.t('like');
  const deleteText = I18n.t('delete_post');

  let attachmentHtml = '';
  // Если к посту прикреплён файл, показываем либо картинку, либо ссылку
  if (post.fileBase64 && post.fileName) {
    const safeName = escapeHtml(post.fileName);
    if (post.fileBase64.startsWith('data:image')) {
      attachmentHtml = `
        <div class="post-attachment">
          <span class="muted">${I18n.t('attachment_label')}:</span>
          <img src="${post.fileBase64}" alt="${safeName}">
        </div>
      `;
    } else {
      attachmentHtml = `
        <div class="post-attachment">
          <span class="muted">${I18n.t('attachment_label')}:</span>
          <a href="${post.fileBase64}" download="${safeName}">
            ${I18n.t('attachment_download')} (${safeName})
          </a>
        </div>
      `;
    }
  }

  div.innerHTML = `
    <div class="post-header">
      <div>
        <strong><a href="user.html?id=${author ? author.id : ''}">${author ? escapeHtml(author.username) : 'Неизвестно'}</a></strong>
        <div class="post-meta">${formatDate(post.createdAt)}</div>
      </div>
      ${canDelete ? `<button class="link-button danger" data-action="delete">${deleteText}</button>` : ''}
    </div>
    <div class="post-content">${escapeHtml(post.content)}</div>
    ${attachmentHtml}
    <div class="post-actions">
      <button class="link-button" data-action="like">
        ${likeText}
      </button>
      <span>${likesCount} ${likesWord}</span>
    </div>
  `;

  // Вешаем обработчики лайка и удаления
  const likeBtn = div.querySelector('[data-action="like"]');
  likeBtn.addEventListener('click', () => {
    toggleLike(post.id, currentUserId);
    if (App.refreshCurrentPage) {
      App.refreshCurrentPage();
    }
  });

  const deleteBtn = div.querySelector('[data-action="delete"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deletePost(post.id, currentUserId);
      if (App.refreshCurrentPage) {
        App.refreshCurrentPage();
      }
    });
  }

  return div;
}

// ========= Страницы =========

const App = {
  requireAuth() {
    initStorage();
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      window.location.href = 'index.html';
    }
  },

  // Для страниц, где есть кнопка "Выйти"
  setupLogoutButton() {
    const btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', handleLogout);
    }
  },

  // Общий языковой переключатель
  setupLanguageSelector() {
    const select = document.getElementById('languageSelect');
    if (!select) return;
    const current = I18n.getLanguage ? I18n.getLanguage() : 'cs';
    select.value = current;
    select.addEventListener('change', () => {
      if (I18n.setLanguage) {
        I18n.setLanguage(select.value);
      }
      window.location.reload();
    });
  },

  // Страница index.html
  setupAuthPage() {
    initStorage();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
      registerForm.addEventListener('submit', handleRegister);
    }

    // Если уже залогинен — сразу в ленту
    if (getCurrentUserId()) {
      window.location.href = 'feed.html';
    }
  },

  // Страница feed.html
  renderFeedPage() {
    initStorage();
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUserId = Number(getCurrentUserId());

    const postForm = document.getElementById('postForm');
    const postContent = document.getElementById('postContent');
    const postFile = document.getElementById('postFile');

    if (postForm && postContent) {
      postForm.addEventListener('submit', e => {
        e.preventDefault();
        const content = postContent.value.trim();
        const file = postFile && postFile.files ? postFile.files[0] : null;

        if (!content && !file) return;

        const finishCreate = (fileData) => {
          createPost(currentUserId, content, fileData);
          postContent.value = '';
          if (postFile) postFile.value = '';
          App.refreshCurrentPage && App.refreshCurrentPage();
        };

        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            finishCreate({
              base64: reader.result,
              name: file.name
            });
          };
          reader.readAsDataURL(file);
        } else {
          finishCreate(null);
        }
      });
    }

    // Поиск пользователей
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.renderSearchResults(searchInput.value, currentUserId);
      });
    }

    // Начальный рендер
    this.refreshCurrentPage = () => {
      this.renderFeedPosts(currentUserId);
      if (searchInput) {
        this.renderSearchResults(searchInput.value, currentUserId);
      }
      this.renderRecommendations(currentUserId);
    };

    this.refreshCurrentPage();
  },

  renderFeedPosts(currentUserId) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    container.innerHTML = '';

    const posts = getPosts();
    posts.forEach(post => {
      const el = renderPost(post, currentUserId);
      container.appendChild(el);
    });
  },

  renderSearchResults(query, currentUserId) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    container.innerHTML = '';

    const q = query.trim().toLowerCase();
    if (!q) return;

    const users = getUsers().filter(u =>
      u.username.toLowerCase().includes(q)
    );

    users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-main">
          <div class="avatar">${userAvatarHTML(u)}</div>
          <div>
            <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
            <div class="muted">${countFollowers(u.id)} ${I18n.t('followers_word')}</div>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  },

  renderRecommendations(currentUserId) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    container.innerHTML = '';

    const recs = getRecommendations(currentUserId, 5);

    if (recs.length === 0) {
      container.innerHTML = `<p class="muted">${I18n.t('no_recommendations')}</p>`;
      return;
    }

    recs.forEach(u => {
      const alreadyFollowing = isFollowing(currentUserId, u.id);
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-main">
          <div class="avatar">${userAvatarHTML(u)}</div>
          <div>
            <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
            <div class="muted">${countFollowers(u.id)} ${I18n.t('followers_word')}</div>
          </div>
        </div>
        <button class="btn ghost small" data-user-id="${u.id}">
          ${alreadyFollowing ? I18n.t('unfollow') : I18n.t('follow')}
        </button>
      `;
      const btn = div.querySelector('button');
      btn.addEventListener('click', () => {
        if (isFollowing(currentUserId, u.id)) {
          unfollow(currentUserId, u.id);
        } else {
          follow(currentUserId, u.id);
        }
        App.refreshCurrentPage && App.refreshCurrentPage();
      });
      container.appendChild(div);
    });
  },

  // Страница profile.html
  renderProfilePage() {
    initStorage();
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUserId = getCurrentUserId();
    const user = findUserById(currentUserId);
    if (!user) {
      handleLogout();
      return;
    }

    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const bioEl = document.getElementById('profileBio');
    const avatarEl = document.getElementById('profileAvatar');

    if (usernameEl) usernameEl.textContent = user.username;
    if (emailEl) emailEl.textContent = user.email;
    if (bioEl) bioEl.textContent = user.bio || I18n.t('bio_empty');

    if (avatarEl) {
      avatarEl.innerHTML = userAvatarHTML(user);
      avatarEl.classList.add('avatar-clickable');
      // Обработчик клика для увеличения фото профиля
      avatarEl.addEventListener('click', () => {
        avatarEl.classList.toggle('avatar-zoomed');
      });
    }

    // Статистика
    const postsCountEl = document.getElementById('postsCount');
    const followersCountEl = document.getElementById('followersCount');
    const followingCountEl = document.getElementById('followingCount');

    const allPosts = getPosts();
    const myPosts = allPosts.filter(p => String(p.userId) === String(currentUserId));

    if (postsCountEl) postsCountEl.textContent = myPosts.length;
    if (followersCountEl) followersCountEl.textContent = countFollowers(currentUserId);
    if (followingCountEl) followingCountEl.textContent = countFollowing(currentUserId);

    // Редактирование био
    const bioForm = document.getElementById('bioForm');
    const bioInput = document.getElementById('bioInput');
    if (bioInput) bioInput.value = user.bio || '';

    if (bioForm && bioInput) {
      bioForm.addEventListener('submit', e => {
        e.preventDefault();
        const users = getUsers();
        const idx = users.findIndex(u => String(u.id) === String(currentUserId));
        if (idx !== -1) {
          users[idx].bio = bioInput.value.trim();
          saveUsers(users);
          if (bioEl) bioEl.textContent = users[idx].bio || I18n.t('bio_empty');
        }
      });
    }

    // Profile photo upload
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', () => {
        const file = avatarInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const users = getUsers();
          const idx = users.findIndex(u => String(u.id) === String(currentUserId));
          if (idx !== -1) {
            users[idx].avatarBase64 = reader.result;
            saveUsers(users);
            if (avatarEl) {
              avatarEl.innerHTML = `<img src="${users[idx].avatarBase64}" alt="${escapeHtml(users[idx].username)}">`;
              // Убеждаемся, что класс для увеличения сохранен
              if (!avatarEl.classList.contains('avatar-clickable')) {
                avatarEl.classList.add('avatar-clickable');
              }
            }
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // Мои посты
    const userPostsContainer = document.getElementById('userPostsContainer');
    if (userPostsContainer) {
      userPostsContainer.innerHTML = '';
      myPosts.forEach(p => {
        const el = renderPost(p, Number(currentUserId));
        userPostsContainer.appendChild(el);
      });
    }

    this.refreshCurrentPage = () => {
      const updatedPosts = getPosts().filter(p => String(p.userId) === String(currentUserId));
      if (postsCountEl) postsCountEl.textContent = updatedPosts.length;
      if (userPostsContainer) {
        userPostsContainer.innerHTML = '';
        updatedPosts.forEach(p => {
          const el = renderPost(p, Number(currentUserId));
          userPostsContainer.appendChild(el);
        });
      }
      if (followersCountEl) followersCountEl.textContent = countFollowers(currentUserId);
      if (followingCountEl) followingCountEl.textContent = countFollowing(currentUserId);
    };

    // Переход к спискам подписчиков / подписок
    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');
    if (followersLink) {
      followersLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `relations.html?type=followers&id=${currentUserId}`;
      });
    }
    if (followingLink) {
      followingLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `relations.html?type=following&id=${currentUserId}`;
      });
    }
  },

  // Страница user.html (просмотр другого пользователя)
  renderUserPage() {
    initStorage();
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUserId = getCurrentUserId();

    const params = new URLSearchParams(window.location.search);
    const viewedUserId = params.get('id');
    if (!viewedUserId) {
      window.location.href = 'feed.html';
      return;
    }

    const user = findUserById(viewedUserId);
    if (!user) {
      window.location.href = 'feed.html';
      return;
    }

    const avatarEl = document.getElementById('viewAvatar');
    const usernameEl = document.getElementById('viewUsername');
    const bioEl = document.getElementById('viewBio');

    if (avatarEl) {
      avatarEl.innerHTML = userAvatarHTML(user);
      avatarEl.classList.add('avatar-clickable');
      // Обработчик клика для увеличения фото профиля
      avatarEl.addEventListener('click', () => {
        avatarEl.classList.toggle('avatar-zoomed');
      });
    }
    if (usernameEl) usernameEl.textContent = user.username;
    if (bioEl) bioEl.textContent = user.bio || I18n.t('bio_empty');

    const postsCountEl = document.getElementById('viewPostsCount');
    const followersCountEl = document.getElementById('viewFollowersCount');
    const followingCountEl = document.getElementById('viewFollowingCount');

    const allPosts = getPosts();
    const userPosts = allPosts.filter(p => String(p.userId) === String(viewedUserId));
    if (postsCountEl) postsCountEl.textContent = userPosts.length;
    if (followersCountEl) followersCountEl.textContent = countFollowers(viewedUserId);
    if (followingCountEl) followingCountEl.textContent = countFollowing(viewedUserId);

    // Кнопка подписки
    const followBtn = document.getElementById('followBtn');
    const updateFollowButtonText = () => {
      const following = isFollowing(currentUserId, viewedUserId);
      if (followBtn) {
        followBtn.textContent = following ? I18n.t('unfollow') : I18n.t('follow');
      }
    };

    if (followBtn) {
      followBtn.addEventListener('click', () => {
        if (String(currentUserId) === String(viewedUserId)) return;
        if (isFollowing(currentUserId, viewedUserId)) {
          unfollow(currentUserId, viewedUserId);
        } else {
          follow(currentUserId, viewedUserId);
        }
        if (followersCountEl) followersCountEl.textContent = countFollowers(viewedUserId);
        updateFollowButtonText();
      });
    }

    updateFollowButtonText();

    // Посты пользователя
    const postsContainer = document.getElementById('viewUserPostsContainer');
    if (postsContainer) {
      postsContainer.innerHTML = '';
      userPosts.forEach(p => {
        const el = renderPost(p, Number(currentUserId));
        postsContainer.appendChild(el);
      });
    }

    this.refreshCurrentPage = () => {
      const updatedPosts = getPosts().filter(p => String(p.userId) === String(viewedUserId));
      if (postsCountEl) postsCountEl.textContent = updatedPosts.length;
      if (followersCountEl) followersCountEl.textContent = countFollowers(viewedUserId);
      if (followingCountEl) followingCountEl.textContent = countFollowing(viewedUserId);
      if (postsContainer) {
        postsContainer.innerHTML = '';
        updatedPosts.forEach(p => {
          const el = renderPost(p, Number(currentUserId));
          postsContainer.appendChild(el);
        });
      }
      updateFollowButtonText();
    };

    // Переход к спискам подписчиков / подписок
    const viewFollowersLink = document.getElementById('viewFollowersLink');
    const viewFollowingLink = document.getElementById('viewFollowingLink');
    if (viewFollowersLink) {
      viewFollowersLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `relations.html?type=followers&id=${viewedUserId}`;
      });
    }
    if (viewFollowingLink) {
      viewFollowingLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `relations.html?type=following&id=${viewedUserId}`;
      });
    }
  },

  // Страница relations.html — список подписчиков / подписок
  renderRelationsPage() {
    initStorage();
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const params = new URLSearchParams(window.location.search);
    const type = params.get('type'); // followers | following
    const userId = params.get('id') || getCurrentUserId();

    const user = findUserById(userId);
    if (!user) {
      window.location.href = 'feed.html';
      return;
    }

    const titleEl = document.getElementById('relationsTitle');
    const subtitleEl = document.getElementById('relationsSubtitle');
    const listEl = document.getElementById('relationsList');
    if (!listEl) return;

    let baseTitle;
    if (type === 'followers') {
      baseTitle = I18n.t('relations_title_followers');
    } else if (type === 'following') {
      baseTitle = I18n.t('relations_title_following');
    } else {
      baseTitle = 'Relations';
    }

    if (titleEl) {
      titleEl.textContent = `${baseTitle} — ${user.username}`;
    }
    if (subtitleEl) {
      subtitleEl.textContent = baseTitle;
    }

    const followers = getFollowers();
    const users = getUsers();
    let relatedUserIds = [];

    if (type === 'followers') {
      relatedUserIds = followers
        .filter(f => String(f.followingId) === String(userId))
        .map(f => String(f.followerId));
    } else if (type === 'following') {
      relatedUserIds = followers
        .filter(f => String(f.followerId) === String(userId))
        .map(f => String(f.followingId));
    }

    const relatedUsers = users.filter(u => relatedUserIds.includes(String(u.id)));

    listEl.innerHTML = '';
    relatedUsers.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item';
      div.innerHTML = `
        <div class="user-main">
          <div class="avatar">${userAvatarHTML(u)}</div>
          <div>
            <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
            <div class="muted">${countFollowers(u.id)} ${I18n.t('followers_word')}</div>
          </div>
        </div>
      `;
      listEl.appendChild(div);
    });
  },

  // по умолчанию заглушка, чтобы не падало
  refreshCurrentPage: null
};

// Делаем App глобальным
window.App = App;

// Автоматическая инициализация на index.html:
document.addEventListener('DOMContentLoaded', () => {
  // Если на странице есть формы логина/регистрации — настраиваем их.
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if (loginForm || registerForm) {
    App.setupAuthPage();
  }
});

