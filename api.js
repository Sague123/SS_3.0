/**
 * Модуль для работы с REST API бэкенда.
 * Все запросы к серверу проходят через этот модуль.
 */

// Если страница открыта с сервера (например http://192.168.1.113:5000/), используем тот же хост для API
const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'file://')
  ? window.location.origin + '/api'
  : 'http://localhost:5000/api';

/**
 * Выполняет HTTP запрос к API.
 * 
 * @param {string} endpoint - Конечная точка API (например, '/posts')
 * @param {object} options - Опции для fetch (method, body, headers и т.д.)
 * @returns {Promise<object>} Ответ от сервера в формате JSON
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    credentials: 'include', // Важно для работы с сессиями Flask
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  // Если передаем FormData, не устанавливаем Content-Type
  if (options.body instanceof FormData) {
    delete defaultOptions.headers['Content-Type'];
  }

  const response = await fetch(url, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка запроса');
  }

  return data;
}

/**
 * API для работы с пользователями
 */
const UserAPI = {
  /**
   * Регистрация нового пользователя
   */
  async register(username, email, password) {
    return apiRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  },

  /**
   * Вход в систему
   */
  async login(identifier, password) {
    return apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
  },

  /**
   * Выход из системы
   */
  async logout() {
    return apiRequest('/logout', {
      method: 'POST'
    });
  },

  /**
   * Получить текущего пользователя
   */
  async getCurrentUser() {
    return apiRequest('/current-user');
  },

  /**
   * Получить пользователя по ID
   */
  async getUser(userId) {
    return apiRequest(`/users/${userId}`);
  },

  /**
   * Поиск пользователей
   */
  async searchUsers(query) {
    return apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
  },

  /**
   * Получить статистику пользователя
   */
  async getUserStats(userId) {
    return apiRequest(`/users/${userId}/stats`);
  },

  /**
   * Получить подписчиков пользователя
   */
  async getFollowers(userId) {
    return apiRequest(`/users/${userId}/followers`);
  },

  /**
   * Получить подписки пользователя
   */
  async getFollowing(userId) {
    return apiRequest(`/users/${userId}/following`);
  },

  /**
   * Подписаться/отписаться на пользователя
   */
  async toggleFollow(userId) {
    return apiRequest(`/follow/${userId}`, {
      method: 'POST'
    });
  },

  /**
   * Обновить профиль
   */
  async updateProfile(bio, avatarFile) {
    const formData = new FormData();
    if (bio !== null && bio !== undefined) {
      formData.append('bio', bio);
    }
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }
    return apiRequest('/profile/update', {
      method: 'POST',
      body: formData
    });
  }
};

/**
 * API для работы с постами
 */
const PostAPI = {
  /**
   * Получить все посты
   */
  async getPosts(userId = null) {
    const url = userId ? `/posts?userId=${userId}` : '/posts';
    return apiRequest(url);
  },

  /**
   * Создать пост
   */
  async createPost(content, file = null) {
    const formData = new FormData();
    formData.append('content', content);
    if (file) {
      formData.append('file', file);
    }
    return apiRequest('/posts', {
      method: 'POST',
      body: formData
    });
  },

  /**
   * Удалить пост
   */
  async deletePost(postId) {
    return apiRequest(`/posts/${postId}`, {
      method: 'DELETE'
    });
  },

  /**
   * Переключить лайк на посте
   */
  async toggleLike(postId) {
    return apiRequest(`/posts/${postId}/like`, {
      method: 'POST'
    });
  },

  /**
   * Получить комментарии к посту
   */
  async getComments(postId) {
    return apiRequest(`/posts/${postId}/comments`);
  },

  /**
   * Создать комментарий
   */
  async createComment(postId, content) {
    return apiRequest(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },

  /**
   * Создать репост
   */
  async createRepost(postId) {
    return apiRequest(`/posts/${postId}/repost`, {
      method: 'POST'
    });
  }
};

/**
 * API для рекомендаций
 */
const RecommendationsAPI = {
  /**
   * Получить рекомендации пользователей
   */
  async getUsers(weights = {}) {
    const params = new URLSearchParams();
    Object.entries(weights).forEach(([k, v]) => {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return;
      params.set(k, String(v));
    });
    const qs = params.toString();
    return apiRequest(`/recommendations/users${qs ? `?${qs}` : ''}`);
  },

  /**
   * Получить рекомендации постов
   */
  async getPosts(weights = {}) {
    const params = new URLSearchParams();
    Object.entries(weights).forEach(([k, v]) => {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return;
      params.set(k, String(v));
    });
    const qs = params.toString();
    return apiRequest(`/recommendations/posts${qs ? `?${qs}` : ''}`);
  }
};

/**
 * API для сообщений
 */
const MessagesAPI = {
  /**
   * Получить сообщения с пользователем
   */
  async getMessages(withUserId) {
    const params = new URLSearchParams();
    params.set('withUser', String(withUserId));
    return apiRequest(`/messages?${params.toString()}`);
  },

  /**
   * Отправить сообщение пользователю
   */
  async sendMessage(toUserId, content) {
    return apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify({ toUserId, content })
    });
  }
};

// Экспортируем API для использования в других модулях
window.API = {
  User: UserAPI,
  Post: PostAPI,
  Recommendations: RecommendationsAPI,
  Messages: MessagesAPI
};
