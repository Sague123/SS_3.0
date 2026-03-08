/**
 * Основной модуль фронтенда, работающий с REST API бэкенда.
 * Заменяет работу с LocalStorage на запросы к серверу.
 */

// Безопасно получаем объект переводов
const I18n = window.I18n || {
  t: (k) => k,
  getLanguage: () => 'cs',
  setLanguage: () => {},
  apply: () => {}
};

// Текущий пользователь (кэшируется)
let currentUser = null;

// Кэш пользователей для быстрого доступа
const usersCache = new Map();

// ========= Recommendation weights (frontend-controlled) =========

const REC_WEIGHTS_STORAGE_KEY = 'recommendationWeights';

const DEFAULT_RECOMMENDATION_WEIGHTS = {
  followersWeight: 1.0,
  commonFollowingWeight: 2.0,
  postsWeight: 0.5,
  likesWeight: 1.0,
  commentsWeight: 2.0,
  repostsWeight: 3.0,
  attentionWeight: 0.5,
  freshnessWeight: 2.0
};

let recommendationWeights = loadRecommendationWeights();

function loadRecommendationWeights() {
  try {
    const raw = localStorage.getItem(REC_WEIGHTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_RECOMMENDATION_WEIGHTS };
  }
}

function saveRecommendationWeights() {
  try {
    localStorage.setItem(REC_WEIGHTS_STORAGE_KEY, JSON.stringify(recommendationWeights));
  } catch {
    // ignore
  }
}

function getRecommendationWeights() {
  return { ...recommendationWeights };
}

function setRecommendationWeight(key, value) {
  const num = Number(value);
  recommendationWeights[key] = Number.isFinite(num) ? num : DEFAULT_RECOMMENDATION_WEIGHTS[key];
  saveRecommendationWeights();
}

function setupRecommendationSettingsPanel(onWeightsChange) {
  const toggleBtn = document.getElementById('recSettingsToggle');
  const panel = document.getElementById('recSettingsPanel');
  if (!toggleBtn || !panel) return;

  // Collapsed by default
  panel.style.display = 'none';

  toggleBtn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  const bindSlider = (key) => {
    const input = document.getElementById(`w_${key}`);
    const val = document.getElementById(`w_${key}_val`);
    if (!input || !val) return;

    // init from storage
    input.value = String(getRecommendationWeights()[key] ?? DEFAULT_RECOMMENDATION_WEIGHTS[key]);
    val.textContent = String(input.value);

    let debounceTimer;
    input.addEventListener('input', () => {
      val.textContent = String(input.value);
      setRecommendationWeight(key, input.value);

      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        onWeightsChange && onWeightsChange(getRecommendationWeights());
      }, 200);
    });
  };

  Object.keys(DEFAULT_RECOMMENDATION_WEIGHTS).forEach(bindSlider);
}

/**
 * Получает случайную фразу для заголовка ленты
 */
function getRandomFeedSubtitle() {
  try {
    if (window.TextDB && I18n && typeof I18n.getLanguage === 'function') {
      const lang = I18n.getLanguage() || 'ru';
      const table = window.TextDB[lang] || window.TextDB['ru'] || window.TextDB['cs'];
      const arr = table && table.feedPhrases;
      if (arr && arr.length) {
        return arr[Math.floor(Math.random() * arr.length)];
      }
    }
  } catch {
    // ignore
  }
  return 'Лента постов';
}

/**
 * Обновляет заголовок ленты случайной фразой из texts-db.js (элемент #feedSubtitlePhrase)
 */
function updateFeedSubtitle() {
  const el = document.getElementById('feedSubtitlePhrase');
  if (el) {
    el.textContent = getRandomFeedSubtitle();
  }
}

/**
 * Получает текущего пользователя из API
 */
async function getCurrentUser() {
  if (currentUser) return currentUser;
  
  try {
    const response = await window.API.User.getCurrentUser();
    if (response.success && response.user) {
      currentUser = response.user;
      return currentUser;
    }
  } catch (error) {
    console.error('Ошибка получения текущего пользователя:', error);
  }
  return null;
}

/**
 * Получает пользователя по ID (с кэшированием)
 */
async function getUserById(userId) {
  if (usersCache.has(userId)) {
    return usersCache.get(userId);
  }
  
  try {
    const response = await window.API.User.getUser(userId);
    if (response.success && response.user) {
      usersCache.set(userId, response.user);
      return response.user;
    }
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
  }
  return null;
}

/**
 * Форматирует дату для отображения
 */
function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Экранирует HTML для безопасности
 */
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

/**
 * Генерирует HTML для аватара пользователя
 */
function userAvatarHTML(user) {
  if (user.avatar) {
    const cleanPath = user.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/');
    const avatarUrl = user.avatar.startsWith('http')
      ? user.avatar
      : `${getServerOrigin()}/api/files/${cleanPath}`;
    return `<img src="${avatarUrl}" alt="${escapeHtml(user.username)}">`;
  }
  const letter = user.username ? user.username.charAt(0).toUpperCase() : '?';
  return escapeHtml(letter);
}

/** Базовый URL сервера для файлов (тот же хост, что и страница, или localhost) */
function getServerOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'file://') {
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

/**
 * Получает URL файла для отображения
 */
function getFileUrl(filePath) {
  if (!filePath) return null;
  if (filePath.startsWith('http')) return filePath;
  const cleanPath = filePath.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/');
  return `${getServerOrigin()}/api/files/${cleanPath}`;
}

/**
 * Отрисовывает пост с комментариями и репостами
 */
async function renderPost(post, currentUserId) {
  const author = await getUserById(post.userId);
  const reactionCounts = post.reactionCounts || { heart: 0, fire: 0, laugh: 0, wow: 0 };
  const commentsCount = post.commentsCount || 0;
  const repostsCount = post.repostsCount || 0;
  let currentUserReaction = post.currentUserReaction || null;
  const liked = !!post.liked;
  const reposted = post.reposted || false;
  const canDelete = String(post.userId) === String(currentUserId);

  const div = document.createElement('div');
  div.className = 'post';
  div.dataset.postId = post.id;

  const deleteText = I18n.t('delete_post');
  const iconsBase = 'Icons';

  // Обработка файлов
  let attachmentHtml = '';
  if (post.files && post.files.length > 0) {
    const file = post.files[0];
    const fileUrl = getFileUrl(file.filePath);
    const safeName = escapeHtml(file.fileName);
    
    if (file.fileType === 'image' && fileUrl) {
      attachmentHtml = `
        <div class="post-attachment">
          <span class="muted">${I18n.t('attachment_label')}:</span>
          <img src="${fileUrl}" alt="${safeName}" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">
        </div>
      `;
    } else if (fileUrl) {
      attachmentHtml = `
        <div class="post-attachment">
          <span class="muted">${I18n.t('attachment_label')}:</span>
          <a href="${fileUrl}" download="${safeName}" target="_blank">
            ${I18n.t('attachment_download')} (${safeName})
          </a>
        </div>
      `;
    }
  }

  const reactionRow = [
    { key: 'heart', emoji: '❤️' },
    { key: 'fire', emoji: '🔥' },
    { key: 'laugh', emoji: '😂' },
    { key: 'wow', emoji: '😮' }
  ].map(r => `
    <div class="post-reaction-item" style="display: inline-flex; flex-direction: column; align-items: center; margin-right: 8px;">
      <button type="button" class="reaction-button" data-reaction="${r.key}" ${currentUserReaction === r.key ? 'data-active="1"' : ''}>${r.emoji}</button>
      <span class="reaction-count" data-reaction="${r.key}">${reactionCounts[r.key] || 0}</span>
    </div>
  `).join('');

  div.innerHTML = `
    <div class="post-header">
      <div>
        <strong><a href="user.html?id=${author ? author.id : ''}">${author ? escapeHtml(author.username) : 'Неизвестно'}</a></strong>
        <div class="post-meta">${formatDate(post.createdAt)}</div>
      </div>
      ${canDelete ? `<button class="link-button danger" data-action="delete">${deleteText}</button>` : ''}
    </div>
    <div class="post-content">${escapeHtml(post.content || '')}</div>
    ${attachmentHtml}
    <div class="post-actions" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div class="post-reactions" style="display: flex; align-items: center; gap: 4px;">
        ${reactionRow}
      </div>
      <div class="post-action-block" style="display: inline-flex; flex-direction: column; align-items: center;">
        <button type="button" class="link-button post-action-btn" data-action="comment" style="padding: 2px;">
          <img src="${iconsBase}/Comment.png" alt="Comment" class="post-action-icon">
        </button>
        <span class="post-action-count" data-action="comment">${commentsCount}</span>
      </div>
      <div class="post-action-block" style="display: inline-flex; flex-direction: column; align-items: center;">
        <button type="button" class="link-button post-action-btn" data-action="repost" style="padding: 2px;" ${reposted ? 'data-reposted="true"' : ''}>
          <img src="${iconsBase}/Repost.png" alt="Repost" class="post-action-icon">
        </button>
        <span class="post-action-count" data-action="repost">${repostsCount}</span>
      </div>
    </div>
    <div class="post-comments" id="comments-${post.id}" style="margin-top: 12px; display: none;">
      <div class="comments-list" id="comments-list-${post.id}"></div>
      <div class="comment-form" style="margin-top: 8px;">
        <textarea class="comment-input" id="comment-input-${post.id}" rows="2" placeholder="${I18n.t('comment_placeholder') || 'Написать комментарий...'}" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid #d1d5db;"></textarea>
        <button class="btn primary small" data-action="submit-comment" data-post-id="${post.id}" style="margin-top: 6px;">
          ${I18n.t('submit_comment') || 'Отправить'}
        </button>
      </div>
    </div>
  `;

  // Обновление счётчиков реакций в DOM
  function updateReactionCounts(counts, current) {
    ['heart', 'fire', 'laugh', 'wow'].forEach(key => {
      const span = div.querySelector(`.reaction-count[data-reaction="${key}"]`);
          if (span) span.textContent = (counts && counts[key]) || 0;
        });
    div.querySelectorAll('.reaction-button').forEach(btn => {
      const key = btn.dataset.reaction;
      btn.classList.toggle('reaction-active', current === key);
      btn.setAttribute('data-active', current === key ? '1' : '0');
    });
  }

  div.querySelectorAll('.reaction-button').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reactionType = btn.dataset.reaction;
      try {
        const response = await window.API.Post.toggleLike(post.id, reactionType);
        if (response.success) {
          updateReactionCounts(response.reactionCounts, response.currentUserReaction);
        }
      } catch (error) {
        alert('Ошибка: ' + error.message);
      }
    });
  });

  // Обработчик комментариев
  const commentBtn = div.querySelector('[data-action="comment"]');
  const commentsSection = div.querySelector(`#comments-${post.id}`);
  commentBtn.addEventListener('click', async () => {
    if (commentsSection.style.display === 'none') {
      commentsSection.style.display = 'block';
      await loadComments(post.id);
    } else {
      commentsSection.style.display = 'none';
    }
  });

  // Обработчик отправки комментария
  const submitCommentBtn = div.querySelector('[data-action="submit-comment"]');
  const commentInput = div.querySelector(`#comment-input-${post.id}`);
  const commentCountEl = div.querySelector('.post-action-count[data-action="comment"]');
  submitCommentBtn.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) return;
    
    try {
      const response = await window.API.Post.createComment(post.id, content);
      if (response.success) {
        commentInput.value = '';
        await loadComments(post.id);
        if (commentCountEl) commentCountEl.textContent = (parseInt(commentCountEl.textContent, 10) || 0) + 1;
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  });

  // Обработчик репоста
  const repostBtn = div.querySelector('[data-action="repost"]');
  const repostCountEl = div.querySelector('.post-action-count[data-action="repost"]');
  repostBtn.addEventListener('click', async () => {
    if (reposted) {
      alert('Вы уже репостили этот пост');
      return;
    }
    
    try {
      const response = await window.API.Post.createRepost(post.id);
      if (response.success) {
        repostBtn.setAttribute('data-reposted', 'true');
        if (repostCountEl) repostCountEl.textContent = (parseInt(repostCountEl.textContent, 10) || 0) + 1;
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  });

  // Обработчик удаления
  const deleteBtn = div.querySelector('[data-action="delete"]');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Удалить пост?')) return;
      
      try {
        const response = await window.API.Post.deletePost(post.id);
        if (response.success) {
          div.remove();
          if (App.refreshCurrentPage) {
            App.refreshCurrentPage();
          }
        }
      } catch (error) {
        alert('Ошибка: ' + error.message);
      }
    });
  }

  return div;
}

/**
 * Загружает и отображает комментарии к посту
 */
async function loadComments(postId) {
  try {
    const response = await window.API.Post.getComments(postId);
    if (response.success) {
      const commentsList = document.getElementById(`comments-list-${postId}`);
      if (!commentsList) return;
      
      commentsList.innerHTML = '';
      
      if (response.comments.length === 0) {
        commentsList.innerHTML = '<p class="muted" style="font-size: 0.85rem;">Пока нет комментариев</p>';
        return;
      }
      
      response.comments.forEach(comment => {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment-item';
        commentDiv.style.cssText = 'padding: 8px; margin-bottom: 8px; background: #f9fafb; border-radius: 6px;';
        commentDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <strong style="font-size: 0.9rem;">${escapeHtml(comment.username)}</strong>
            <span class="muted" style="font-size: 0.75rem;">${formatDate(comment.createdAt)}</span>
          </div>
          <div style="font-size: 0.9rem;">${escapeHtml(comment.content)}</div>
        `;
        commentsList.appendChild(commentDiv);
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки комментариев:', error);
  }
}

// ========= Страницы =========

const App = {
  /**
   * Проверяет авторизацию пользователя
   */
  async requireAuth() {
    try {
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } catch (error) {
      window.location.href = 'index.html';
      return false;
    }
  },

  /**
   * Настройка кнопки выхода
   */
  setupLogoutButton() {
    const btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          await window.API.User.logout();
          currentUser = null;
          usersCache.clear();
          window.location.href = 'index.html';
        } catch (error) {
          console.error('Ошибка выхода:', error);
          window.location.href = 'index.html';
        }
      });
    }
  },

  /**
   * Настройка языкового переключателя
   */
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

  /**
   * Страница index.html - авторизация
   */
  async setupAuthPage() {
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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

        try {
          const response = await window.API.User.login(identifier, password);
          if (response.success) {
            currentUser = response.user;
            window.location.href = 'feed.html';
          }
        } catch (error) {
          errorEl.textContent = error.message || I18n.t('error_wrong_password');
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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

        try {
          const response = await window.API.User.register(username, email, password);
          if (response.success) {
            currentUser = response.user;
            window.location.href = 'feed.html';
          }
        } catch (error) {
          errorEl.textContent = error.message || I18n.t('error_fill_all');
        }
      });
    }

    // Если уже залогинен — сразу в ленту
    try {
      const user = await getCurrentUser();
      if (user) {
        window.location.href = 'feed.html';
      }
    } catch (error) {
      // Игнорируем ошибку, пользователь не залогинен
    }
  },

  async renderMiniProfile(currentUser) {
    const card = document.getElementById('miniProfileCard');
    if (!card || !currentUser) return;

    const avatarEl = document.getElementById('miniProfileAvatar');
    const nameEl = document.getElementById('miniProfileName');
    const usernameEl = document.getElementById('miniProfileUsername');
    const followersEl = document.getElementById('miniProfileFollowers');
    const followingEl = document.getElementById('miniProfileFollowing');
    const bioInput = document.getElementById('miniProfileBioInput');
    const saveBtn = document.getElementById('miniProfileBioSave');

    if (avatarEl) {
      avatarEl.innerHTML = userAvatarHTML(currentUser);
      avatarEl.classList.add('avatar-clickable', 'mini-avatar');
      avatarEl.addEventListener('click', () => {
        avatarEl.classList.toggle('avatar-zoomed');
      });
    }
    if (nameEl) nameEl.textContent = currentUser.username || '';
    if (usernameEl) usernameEl.textContent = currentUser.email || '';

    try {
      const statsResponse = await window.API.User.getUserStats(currentUser.id);
      if (statsResponse.success) {
        const stats = statsResponse.stats;
        if (followersEl) followersEl.textContent = stats.followersCount;
        if (followingEl) followingEl.textContent = stats.followingCount;
      }
    } catch (error) {
      // ignore
    }

    if (bioInput) bioInput.value = currentUser.bio || '';
    if (saveBtn && bioInput) {
      saveBtn.addEventListener('click', async () => {
        const bio = bioInput.value.trim();
        try {
          const resp = await window.API.User.updateProfile(bio, null);
          if (resp.success && resp.user) {
            currentUser.bio = resp.user.bio;
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }
  },

  /**
   * Страница feed.html - лента постов
   */
  async renderFeedPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    updateFeedSubtitle();
    setupRecommendationSettingsPanel(() => {
      if (this.refreshCurrentPage) {
        this.refreshCurrentPage();
      }
    });
    
    if (I18n.apply) {
      I18n.apply(document);
    }
    updateFeedSubtitle();

    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    await this.renderMiniProfile(currentUser);

    // Сетевая статистика и последние пользователи
    try {
      const statsRes = await window.API.Stats.getNetworkStats();
      if (statsRes.success && statsRes.stats) {
        const s = statsRes.stats;
        const elUsers = document.getElementById('statUsers');
        const elPosts = document.getElementById('statPosts');
        const elComments = document.getElementById('statComments');
        if (elUsers) elUsers.textContent = s.usersCount ?? 0;
        if (elPosts) elPosts.textContent = s.postsCount ?? 0;
        if (elComments) elComments.textContent = s.commentsCount ?? 0;
      }
    } catch (e) { /* ignore */ }
    try {
      const recentRes = await window.API.User.getRecentUsers();
      const container = document.getElementById('lastRegisteredUsers');
      if (container && recentRes.success && recentRes.users && recentRes.users.length) {
        container.innerHTML = '';
        recentRes.users.forEach(u => {
          const div = document.createElement('div');
          div.className = 'user-item';
          div.innerHTML = `
            <div class="user-main">
              <div class="avatar">${userAvatarHTML(u)}</div>
              <div>
                <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
                <div class="muted">${escapeHtml(u.email || '')}</div>
              </div>
            </div>
          `;
          container.appendChild(div);
        });
      } else if (container) {
        container.innerHTML = '<p class="muted">No users yet</p>';
      }
    } catch (e) { /* ignore */ }

    const postForm = document.getElementById('postForm');
    const postContent = document.getElementById('postContent');
    const postFile = document.getElementById('postFile');
    const postFileStatus = document.getElementById('postFileStatus');

    if (postForm && postContent) {
      postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContent.value.trim();
        const file = postFile && postFile.files ? postFile.files[0] : null;

        if (!content && !file) return;

        try {
          const response = await window.API.Post.createPost(content, file);
          if (response.success) {
            postContent.value = '';
            if (postFile) postFile.value = '';
            await this.refreshCurrentPage();
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }

    // Индикация прикрепленного файла
    if (postFile && postFileStatus) {
      postFile.addEventListener('change', () => {
        if (postFile.files && postFile.files[0]) {
          const name = postFile.files[0].name;
          postFileStatus.textContent = `Фото прикреплено: ${name}`;
        } else {
          postFileStatus.textContent = '';
        }
      });
    }

    // Поиск пользователей
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.renderSearchResults(searchInput.value, currentUser.id);
        }, 300);
      });
    }

    // Начальный рендер
    this.refreshCurrentPage = async () => {
      const weights = getRecommendationWeights();
      await this.renderFeedPosts(currentUser.id, weights);
      if (searchInput) {
        await this.renderSearchResults(searchInput.value, currentUser.id);
      }
      await this.renderRecommendations(currentUser.id, weights);
    };

    await this.refreshCurrentPage();
  },

  /**
   * Рендерит посты в ленте
   */
  async renderFeedPosts(currentUserId, weights = null) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    container.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      // Лента = рекомендации постов (весовая формула + свежесть)
      const response = await window.API.Recommendations.getPosts(weights || getRecommendationWeights());
      if (response.success) {
        container.innerHTML = '';
        if (response.posts.length === 0) {
          container.innerHTML = '<p class="muted">Пока нет постов</p>';
          return;
        }
        
        for (const post of response.posts) {
          const el = await renderPost(post, currentUserId);
          container.appendChild(el);
        }
      }
    } catch (error) {
      container.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
    }
  },

  /**
   * Рендерит результаты поиска
   */
  async renderSearchResults(query, currentUserId) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    container.innerHTML = '';

    const q = query.trim();
    if (!q) return;

    try {
      const response = await window.API.User.searchUsers(q);
      if (response.success) {
        response.users.forEach(u => {
          const div = document.createElement('div');
          div.className = 'user-item';
          div.innerHTML = `
            <div class="user-main">
              <div class="avatar">${userAvatarHTML(u)}</div>
              <div>
                <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
                <div class="muted">${u.id}</div>
              </div>
            </div>
          `;
          container.appendChild(div);
        });
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
    }
  },

  /**
   * Рендерит рекомендации пользователей
   */
  async renderRecommendations(currentUserId, weights = null) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    container.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      const response = await window.API.Recommendations.getUsers(weights || getRecommendationWeights());
      if (response.success) {
        container.innerHTML = '';
        
        if (response.users.length === 0) {
          container.innerHTML = `<p class="muted">${I18n.t('no_recommendations')}</p>`;
          return;
        }

        // Получаем информацию о подписках (одним запросом)
        const followingMap = new Map();
        try {
          const followersResponse = await window.API.User.getFollowing(currentUserId);
          if (followersResponse.success) {
            followersResponse.users.forEach(u => followingMap.set(u.id, true));
          }
        } catch (error) {
          // Игнорируем ошибку
        }

        response.users.forEach(u => {
          const alreadyFollowing = followingMap.has(u.id);
          const div = document.createElement('div');
          div.className = 'user-item';
          div.innerHTML = `
            <div class="user-main">
              <div class="avatar">${userAvatarHTML(u)}</div>
              <div>
                <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
                <div class="muted">${u.id}</div>
              </div>
            </div>
            <button class="btn ghost small" data-user-id="${u.id}">
              ${alreadyFollowing ? I18n.t('unfollow') : I18n.t('follow')}
            </button>
          `;
          const btn = div.querySelector('button');
          btn.addEventListener('click', async () => {
            try {
              const followResponse = await window.API.User.toggleFollow(u.id);
              if (followResponse.success) {
                btn.textContent = followResponse.following ? I18n.t('unfollow') : I18n.t('follow');
              }
            } catch (error) {
              alert('Ошибка: ' + error.message);
            }
          });
          container.appendChild(div);
        });
      }
    } catch (error) {
      container.innerHTML = `<p class="muted">${I18n.t('no_recommendations')}</p>`;
    }
  },

  /**
   * Страница profile.html - профиль текущего пользователя
   */
  async renderProfilePage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }

    const usernameEl = document.getElementById('profileUsername');
    const emailEl = document.getElementById('profileEmail');
    const bioEl = document.getElementById('profileBio');
    const avatarEl = document.getElementById('profileAvatar');

    if (usernameEl) usernameEl.textContent = currentUser.username;
    if (emailEl) emailEl.textContent = currentUser.email;
    if (bioEl) bioEl.textContent = currentUser.bio || I18n.t('bio_empty');

    if (avatarEl) {
      avatarEl.innerHTML = userAvatarHTML(currentUser);
      avatarEl.classList.add('avatar-clickable');
      avatarEl.addEventListener('click', () => {
        avatarEl.classList.toggle('avatar-zoomed');
      });
    }

    // Загружаем статистику
    try {
      const statsResponse = await window.API.User.getUserStats(currentUser.id);
      if (statsResponse.success) {
        const stats = statsResponse.stats;
        const postsCountEl = document.getElementById('postsCount');
        const followersCountEl = document.getElementById('followersCount');
        const followingCountEl = document.getElementById('followingCount');

        if (postsCountEl) postsCountEl.textContent = stats.postsCount;
        if (followersCountEl) followersCountEl.textContent = stats.followersCount;
        if (followingCountEl) followingCountEl.textContent = stats.followingCount;
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }

    // Редактирование био
    const bioForm = document.getElementById('bioForm');
    const bioInput = document.getElementById('bioInput');
    if (bioInput) bioInput.value = currentUser.bio || '';

    if (bioForm && bioInput) {
      bioForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bio = bioInput.value.trim();
        try {
          const response = await window.API.User.updateProfile(bio, null);
          if (response.success) {
            currentUser.bio = bio;
            if (bioEl) bioEl.textContent = bio || I18n.t('bio_empty');
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }

    // Загрузка фото профиля
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        
        try {
          const response = await window.API.User.updateProfile(null, file);
          if (response.success && response.user) {
            currentUser.avatar = response.user.avatar;
            if (avatarEl) {
              avatarEl.innerHTML = userAvatarHTML(currentUser);
              if (!avatarEl.classList.contains('avatar-clickable')) {
                avatarEl.classList.add('avatar-clickable');
              }
            }
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }

    // Загружаем посты пользователя
    const userPostsContainer = document.getElementById('userPostsContainer');
    if (userPostsContainer) {
      userPostsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
      try {
        const postsResponse = await window.API.Post.getPosts(currentUser.id);
        if (postsResponse.success) {
          userPostsContainer.innerHTML = '';
          if (postsResponse.posts.length === 0) {
            userPostsContainer.innerHTML = '<p class="muted">Пока нет постов</p>';
          } else {
            for (const post of postsResponse.posts) {
              const el = await renderPost(post, currentUser.id);
              userPostsContainer.appendChild(el);
            }
          }
        }
      } catch (error) {
        userPostsContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
      }
    }

    this.refreshCurrentPage = async () => {
      // Обновляем статистику
      try {
        const statsResponse = await window.API.User.getUserStats(currentUser.id);
        if (statsResponse.success) {
          const stats = statsResponse.stats;
          const postsCountEl = document.getElementById('postsCount');
          const followersCountEl = document.getElementById('followersCount');
          const followingCountEl = document.getElementById('followingCount');

          if (postsCountEl) postsCountEl.textContent = stats.postsCount;
          if (followersCountEl) followersCountEl.textContent = stats.followersCount;
          if (followingCountEl) followingCountEl.textContent = stats.followingCount;
        }
      } catch (error) {
        console.error('Ошибка обновления статистики:', error);
      }

      // Обновляем посты
      if (userPostsContainer) {
        userPostsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
        try {
          const postsResponse = await window.API.Post.getPosts(currentUser.id);
          if (postsResponse.success) {
            userPostsContainer.innerHTML = '';
            if (postsResponse.posts.length === 0) {
              userPostsContainer.innerHTML = '<p class="muted">Пока нет постов</p>';
            } else {
              for (const post of postsResponse.posts) {
                const el = await renderPost(post, currentUser.id);
                userPostsContainer.appendChild(el);
              }
            }
          }
        } catch (error) {
          userPostsContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
        }
      }
    };

    // Переход к спискам подписчиков / подписок
    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');
    if (followersLink) {
      followersLink.href = `relations.html?type=followers&id=${currentUser.id}`;
    }
    if (followingLink) {
      followingLink.href = `relations.html?type=following&id=${currentUser.id}`;
    }
  },

  /**
   * Страница user.html - просмотр другого пользователя
   */
  async renderUserPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const params = new URLSearchParams(window.location.search);
    const viewedUserId = params.get('id');
    if (!viewedUserId) {
      window.location.href = 'feed.html';
      return;
    }

    const viewedUser = await getUserById(viewedUserId);
    if (!viewedUser) {
      window.location.href = 'feed.html';
      return;
    }

    const avatarEl = document.getElementById('viewAvatar');
    const usernameEl = document.getElementById('viewUsername');
    const bioEl = document.getElementById('viewBio');

    if (avatarEl) {
      avatarEl.innerHTML = userAvatarHTML(viewedUser);
      avatarEl.classList.add('avatar-clickable');
      avatarEl.addEventListener('click', () => {
        avatarEl.classList.toggle('avatar-zoomed');
      });
    }
    if (usernameEl) usernameEl.textContent = viewedUser.username;
    if (bioEl) bioEl.textContent = viewedUser.bio || I18n.t('bio_empty');

    // Загружаем статистику
    try {
      const statsResponse = await window.API.User.getUserStats(viewedUserId);
      if (statsResponse.success) {
        const stats = statsResponse.stats;
        const postsCountEl = document.getElementById('viewPostsCount');
        const followersCountEl = document.getElementById('viewFollowersCount');
        const followingCountEl = document.getElementById('viewFollowingCount');

        if (postsCountEl) postsCountEl.textContent = stats.postsCount;
        if (followersCountEl) followersCountEl.textContent = stats.followersCount;
        if (followingCountEl) followingCountEl.textContent = stats.followingCount;
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }

    // Кнопка подписки
    const followBtn = document.getElementById('followBtn');
    if (followBtn && String(currentUser.id) !== String(viewedUserId)) {
      // Проверяем, подписан ли уже
      try {
        const followingResponse = await window.API.User.getFollowing(currentUser.id);
        const isFollowing = followingResponse.success && 
          followingResponse.users.some(u => String(u.id) === String(viewedUserId));
        
        followBtn.textContent = isFollowing ? I18n.t('unfollow') : I18n.t('follow');
        
        followBtn.addEventListener('click', async () => {
          try {
            const response = await window.API.User.toggleFollow(viewedUserId);
            if (response.success) {
              followBtn.textContent = response.following ? I18n.t('unfollow') : I18n.t('follow');
              
              // Обновляем счетчик подписчиков
              const statsResponse = await window.API.User.getUserStats(viewedUserId);
              if (statsResponse.success) {
                const followersCountEl = document.getElementById('viewFollowersCount');
                if (followersCountEl) {
                  followersCountEl.textContent = statsResponse.stats.followersCount;
                }
              }
            }
          } catch (error) {
            alert('Ошибка: ' + error.message);
          }
        });
      } catch (error) {
        console.error('Ошибка проверки подписки:', error);
      }
    } else if (followBtn) {
      followBtn.style.display = 'none';
    }

    // Загружаем посты пользователя
    const postsContainer = document.getElementById('viewUserPostsContainer');
    if (postsContainer) {
      postsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
      try {
        const postsResponse = await window.API.Post.getPosts(viewedUserId);
        if (postsResponse.success) {
          postsContainer.innerHTML = '';
          if (postsResponse.posts.length === 0) {
            postsContainer.innerHTML = '<p class="muted">Пока нет постов</p>';
          } else {
            for (const post of postsResponse.posts) {
              const el = await renderPost(post, currentUser.id);
              postsContainer.appendChild(el);
            }
          }
        }
      } catch (error) {
        postsContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
      }
    }

    // Переход к спискам подписчиков / подписок
    const viewFollowersLink = document.getElementById('viewFollowersLink');
    const viewFollowingLink = document.getElementById('viewFollowingLink');
    if (viewFollowersLink) {
      viewFollowersLink.href = `relations.html?type=followers&id=${viewedUserId}`;
    }
    if (viewFollowingLink) {
      viewFollowingLink.href = `relations.html?type=following&id=${viewedUserId}`;
    }
  },

  /**
   * Страница relations.html - список подписчиков/подписок
   */
  async renderRelationsPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const params = new URLSearchParams(window.location.search);
    const type = params.get('type'); // followers | following
    const userId = params.get('id');

    if (!userId) {
      window.location.href = 'feed.html';
      return;
    }

    const user = await getUserById(userId);
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

    listEl.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      let users = [];
      if (type === 'followers') {
        const response = await window.API.User.getFollowers(userId);
        if (response.success) {
          users = response.users;
        }
      } else if (type === 'following') {
        const response = await window.API.User.getFollowing(userId);
        if (response.success) {
          users = response.users;
        }
      }

      listEl.innerHTML = '';
      if (users.length === 0) {
        listEl.innerHTML = '<p class="muted">Список пуст</p>';
        return;
      }

      users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
          <div class="user-main">
            <div class="avatar">${userAvatarHTML(u)}</div>
            <div>
              <a href="user.html?id=${u.id}"><strong>${escapeHtml(u.username)}</strong></a>
              <div class="muted">${u.id}</div>
            </div>
          </div>
        `;
        listEl.appendChild(div);
      });
    } catch (error) {
      listEl.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
    }
  },

  /**
   * Страница messages.html — переписка
   */
  async renderMessagesPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const searchInput = document.getElementById('messagesSearchInput');
    const usersList = document.getElementById('messagesUsersList');
    const conversationsList = document.getElementById('messagesConversationsList');
    const recommendationsList = document.getElementById('messagesRecommendationsList');
    const convHeader = document.getElementById('messagesConversationHeader');
    const convContainer = document.getElementById('messagesConversation');
    const inputEl = document.getElementById('messagesInput');
    const sendBtn = document.getElementById('messagesSendBtn');

    let selectedUser = null;

    function selectUserAndLoad(u, highlightEl) {
      selectedUser = u;
      loadConversation(u.id, u.username);
      [conversationsList, recommendationsList, usersList].forEach(el => {
        if (!el) return;
        el.querySelectorAll('.user-item').forEach(item => item.classList.remove('selected'));
      });
      if (highlightEl) highlightEl.classList.add('selected');
    }

    function renderUserItem(u, container) {
      if (!container) return;
      const div = document.createElement('div');
      div.className = 'user-item';
      div.style.cursor = 'pointer';
      div.innerHTML = `
        <div class="user-main">
          <div class="avatar">${userAvatarHTML(u)}</div>
          <div>
            <strong>${escapeHtml(u.username)}</strong>
            <div class="muted">${escapeHtml(u.email || '')}</div>
          </div>
        </div>
      `;
      div.addEventListener('click', () => selectUserAndLoad(u, div));
      container.appendChild(div);
    }

    async function loadConversation(withUserId, withUsername) {
      if (!convContainer || !convHeader) return;
      convHeader.textContent = `Диалог с ${withUsername}`;
      convContainer.innerHTML = '<p class="muted">Загрузка...</p>';
      try {
        const resp = await window.API.Messages.getMessages(withUserId);
        if (resp.success) {
          convContainer.innerHTML = '';
          if (resp.messages.length === 0) {
            convContainer.innerHTML = '<p class="muted">Пока нет сообщений</p>';
            return;
          }
          resp.messages.forEach(msg => {
            const div = document.createElement('div');
            const isOwn = String(msg.fromUserId) === String(currentUser.id);
            div.style.marginBottom = '6px';
            div.style.textAlign = isOwn ? 'right' : 'left';
            div.innerHTML = `
              <div style="display: inline-block; max-width: 80%; text-align: left; padding: 6px 8px; border-radius: 10px; background: ${isOwn ? '#dbeafe' : '#f3f4f6'};">
                <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 2px;">
                  ${escapeHtml(isOwn ? 'You' : msg.fromUsername)}
                  <span style="margin-left: 4px;">${formatDate(msg.createdAt)}</span>
                </div>
                <div style="font-size: 0.9rem;">${escapeHtml(msg.content)}</div>
              </div>
            `;
            convContainer.appendChild(div);
          });
          convContainer.scrollTop = convContainer.scrollHeight;
        }
      } catch (error) {
        convContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
      }
    }

    async function searchUsersForMessages(query) {
      if (!usersList) return;
      usersList.innerHTML = '';
      const q = query.trim();
      if (!q) return;
      try {
        const resp = await window.API.User.searchUsers(q);
        if (resp.success) {
          resp.users.forEach(u => {
            if (String(u.id) === String(currentUser.id)) return;
            const div = document.createElement('div');
            div.className = 'user-item';
            div.style.cursor = 'pointer';
            div.innerHTML = `
              <div class="user-main">
                <div class="avatar">${userAvatarHTML(u)}</div>
                <div>
                  <strong>${escapeHtml(u.username)}</strong>
                  <div class="muted">${escapeHtml(u.email || '')}</div>
                </div>
              </div>
            `;
            div.addEventListener('click', () => selectUserAndLoad(u, div));
            usersList.appendChild(div);
          });
        }
      } catch (error) {
        usersList.innerHTML = `<p class="error-text">Ошибка поиска: ${error.message}</p>`;
      }
    }

    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchUsersForMessages(searchInput.value), 300);
      });
    }

    // Загрузка диалогов и рекомендаций
    (async () => {
      try {
        const convResp = await window.API.Messages.getConversations();
        if (conversationsList && convResp.success && convResp.users && convResp.users.length) {
          conversationsList.innerHTML = '';
          convResp.users.forEach(u => renderUserItem(u, conversationsList));
        } else if (conversationsList) {
          conversationsList.innerHTML = '<p class="muted">No conversations yet</p>';
        }
      } catch (e) {
        if (conversationsList) conversationsList.innerHTML = '<p class="muted">No conversations</p>';
      }
      try {
        const recResp = await window.API.Recommendations.getUsers();
        const users = recResp.users || recResp.recommendations || [];
        const toShow = users.filter(u => String(u.id) !== String(currentUser.id)).slice(0, 10);
        if (recommendationsList) {
          recommendationsList.innerHTML = '';
          if (toShow.length) toShow.forEach(u => renderUserItem(u, recommendationsList));
          else {
            const recentResp = await window.API.User.getRecentUsers();
            const recent = (recentResp.users || []).filter(u => String(u.id) !== String(currentUser.id)).slice(0, 5);
            recent.forEach(u => renderUserItem(u, recommendationsList));
            if (recent.length === 0) recommendationsList.innerHTML = '<p class="muted">No users to recommend</p>';
          }
        }
      } catch (e) {
        try {
          const recentResp = await window.API.User.getRecentUsers();
          const recent = (recentResp.users || []).filter(u => String(u.id) !== String(currentUser.id)).slice(0, 5);
          if (recommendationsList) {
            recommendationsList.innerHTML = '';
            if (recent.length) recent.forEach(u => renderUserItem(u, recommendationsList));
            else recommendationsList.innerHTML = '<p class="muted">No users to recommend</p>';
          }
        } catch (e2) {
          if (recommendationsList) recommendationsList.innerHTML = '<p class="muted">No recommendations</p>';
        }
      }
    })();

    if (sendBtn && inputEl) {
      sendBtn.addEventListener('click', async () => {
        const text = inputEl.value.trim();
        if (!text || !selectedUser) return;
        try {
          const resp = await window.API.Messages.sendMessage(selectedUser.id, text);
          if (resp.success) {
            inputEl.value = '';
            await loadConversation(selectedUser.id, selectedUser.username);
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }
  },

  // По умолчанию заглушка
  refreshCurrentPage: null
};

// Делаем App глобальным
window.App = App;

// Автоматическая инициализация на index.html
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if (loginForm || registerForm) {
    App.setupAuthPage();
  }
});
