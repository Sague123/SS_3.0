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

// Рандомные фразы для заголовка ленты
const feedSubtitles = [
  'Лента постов',
  'Что нового?',
  'Последние обновления',
  'Интересные истории',
  'Свежие новости',
  'Ваши друзья здесь',
  'Добро пожаловать!',
  'Что происходит?'
];

/**
 * Получает случайную фразу для заголовка ленты
 */
function getRandomFeedSubtitle() {
  return feedSubtitles[Math.floor(Math.random() * feedSubtitles.length)];
}

/**
 * Обновляет заголовок ленты случайной фразой
 */
function updateFeedSubtitle() {
  const subtitleEl = document.querySelector('.subtitle[data-i18n="feed_subtitle"]');
  if (subtitleEl) {
    subtitleEl.textContent = getRandomFeedSubtitle();
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
  const likesCount = post.likesCount || 0;
  const commentsCount = post.commentsCount || 0;
  const repostsCount = post.repostsCount || 0;
  const liked = post.liked || false;
  const reposted = post.reposted || false;
  const canDelete = String(post.userId) === String(currentUserId);

  const div = document.createElement('div');
  div.className = 'post';
  div.dataset.postId = post.id;

  const likesWord = I18n.t('likes_word');
  const commentsWord = I18n.t('comments_word') || 'комментариев';
  const repostsWord = I18n.t('reposts_word') || 'репостов';
  const likeText = liked ? I18n.t('unlike') : I18n.t('like');
  const deleteText = I18n.t('delete_post');
  const commentText = I18n.t('comment') || 'Комментировать';
  const repostText = I18n.t('repost') || 'Репост';

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
    <div class="post-actions">
      <button class="link-button" data-action="like" ${liked ? 'data-liked="true"' : ''}>
        ${likeText}
      </button>
      <span>${likesCount} ${likesWord}</span>
      <button class="link-button" data-action="comment" style="margin-left: 12px;">
        ${commentText}
      </button>
      <span>${commentsCount} ${commentsWord}</span>
      <button class="link-button" data-action="repost" style="margin-left: 12px;" ${reposted ? 'data-reposted="true"' : ''}>
        ${repostText}
      </button>
      <span>${repostsCount} ${repostsWord}</span>
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

  // Обработчик лайка
  const likeBtn = div.querySelector('[data-action="like"]');
  likeBtn.addEventListener('click', async () => {
    try {
      const response = await window.API.Post.toggleLike(post.id);
      if (response.success) {
        likeBtn.textContent = response.liked ? I18n.t('unlike') : I18n.t('like');
        likeBtn.setAttribute('data-liked', response.liked);
        const likesSpan = likeBtn.nextElementSibling;
        likesSpan.textContent = `${response.likesCount} ${likesWord}`;
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
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
  submitCommentBtn.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) return;
    
    try {
      const response = await window.API.Post.createComment(post.id, content);
      if (response.success) {
        commentInput.value = '';
        await loadComments(post.id);
        // Обновляем счетчик комментариев
        const commentsSpan = commentBtn.nextElementSibling;
        const currentCount = parseInt(commentsSpan.textContent) || 0;
        commentsSpan.textContent = `${currentCount + 1} ${commentsWord}`;
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  });

  // Обработчик репоста
  const repostBtn = div.querySelector('[data-action="repost"]');
  repostBtn.addEventListener('click', async () => {
    if (reposted) {
      alert('Вы уже репостили этот пост');
      return;
    }
    
    try {
      const response = await window.API.Post.createRepost(post.id);
      if (response.success) {
        repostBtn.setAttribute('data-reposted', 'true');
        repostBtn.textContent = I18n.t('reposted') || 'Репостнуто';
        const repostsSpan = repostBtn.nextElementSibling;
        const currentCount = parseInt(repostsSpan.textContent) || 0;
        repostsSpan.textContent = `${currentCount + 1} ${repostsWord}`;
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

  /**
   * Страница feed.html - лента постов
   */
  async renderFeedPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;

    this.setupLogoutButton();
    this.setupLanguageSelector();
    updateFeedSubtitle();
    
    if (I18n.apply) {
      I18n.apply(document);
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const postForm = document.getElementById('postForm');
    const postContent = document.getElementById('postContent');
    const postFile = document.getElementById('postFile');

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
      await this.renderFeedPosts(currentUser.id);
      if (searchInput) {
        await this.renderSearchResults(searchInput.value, currentUser.id);
      }
      await this.renderRecommendations(currentUser.id);
    };

    await this.refreshCurrentPage();
  },

  /**
   * Рендерит посты в ленте
   */
  async renderFeedPosts(currentUserId) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    container.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      const response = await window.API.Post.getPosts();
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
  async renderRecommendations(currentUserId) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    container.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      const response = await window.API.Recommendations.getUsers();
      if (response.success) {
        container.innerHTML = '';
        
        if (response.users.length === 0) {
          container.innerHTML = `<p class="muted">${I18n.t('no_recommendations')}</p>`;
          return;
        }

        // Получаем информацию о подписках
        const followingMap = new Map();
        for (const user of response.users) {
          // Проверяем, подписан ли текущий пользователь
          try {
            const followersResponse = await window.API.User.getFollowing(currentUserId);
            if (followersResponse.success) {
              followersResponse.users.forEach(u => followingMap.set(u.id, true));
            }
          } catch (error) {
            // Игнорируем ошибку
          }
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
