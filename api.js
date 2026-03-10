// Backend REST API client. Uses same host as page when served, else localhost.
// When the page is not on port 5000, API requests go to port 5000 so they hit Flask (CORS is enabled).

function getApiBaseUrl() {
  if (typeof window === 'undefined' || !window.location) {
    return 'http://localhost:5000/api';
  }
  const origin = window.location.origin;
  if (origin === 'file://' || origin === 'null' || !origin) {
    return 'http://localhost:5000/api';
  }
  const port = window.location.port || '';
  if (port === '5000') {
    return origin + '/api';
  }
  const host = window.location.hostname;
  const protocol = window.location.protocol;
  return protocol + '//' + host + ':5000/api';
}

const API_BASE_URL = getApiBaseUrl();

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  // FormData sets its own Content-Type
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

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let data;
  if (contentType.includes('application/json')) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Server returned invalid JSON. Ensure the backend is running (python app.py) and the page is opened from the same host.');
    }
  } else {
    if (response.ok) {
      throw new Error('Server did not return JSON. Check URL and ensure the backend is running.');
    }
    throw new Error(`Error ${response.status}. Server returned HTML instead of JSON. Run the backend: python app.py and open the page from the same origin (e.g. http://127.0.0.1:5000).`);
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

const UserAPI = {
  async register(username, email, password) {
    return apiRequest('/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  },
  async login(identifier, password) {
    return apiRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password })
    });
  },
  async logout() {
    return apiRequest('/logout', { method: 'POST' });
  },
  async getCurrentUser() {
    return apiRequest('/current-user');
  },
  async getUser(userId) {
    return apiRequest(`/users/${userId}`);
  },
  async searchUsers(query) {
    return apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
  },
  async getUserStats(userId) {
    return apiRequest(`/users/${userId}/stats`);
  },
  async getFollowers(userId) {
    return apiRequest(`/users/${userId}/followers`);
  },
  async getFollowing(userId) {
    return apiRequest(`/users/${userId}/following`);
  },
  async toggleFollow(userId) {
    return apiRequest(`/follow/${userId}`, { method: 'POST' });
  },
  async updateProfile(bio, avatarFile, profileGradient) {
    const formData = new FormData();
    if (bio !== null && bio !== undefined) {
      formData.append('bio', bio);
    }
    if (avatarFile) {
      formData.append('avatar', avatarFile);
    }
    if (profileGradient != null && profileGradient !== '') {
      formData.append('profileGradient', profileGradient);
    }
    return apiRequest('/profile/update', {
      method: 'POST',
      body: formData
    });
  },
  async getRecentUsers() {
    return apiRequest('/users/recent');
  }
};

const PostAPI = {
  async getPosts(userId = null) {
    const url = userId ? `/posts?userId=${userId}` : '/posts';
    return apiRequest(url);
  },
  async getPost(postId) {
    return apiRequest(`/posts/${postId}`);
  },
  async createPost(content, file = null, mood = 'happy', anonymous = false) {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('mood', mood);
    if (file) formData.append('file', file);
    if (anonymous) formData.append('anonymous', '1');
    return apiRequest('/posts', { method: 'POST', body: formData });
  },
  async deletePost(postId) {
    return apiRequest(`/posts/${postId}`, { method: 'DELETE' });
  },
  async toggleLike(postId, reactionType = 'heart') {
    return apiRequest(`/posts/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({ reactionType })
    });
  },
  async getComments(postId, sort = 'latest', limit = 50, offset = 0) {
    const params = new URLSearchParams();
    params.set('sort', sort);
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));
    return apiRequest(`/posts/${postId}/comments?${params.toString()}`);
  },
  async createComment(postId, content, anonymous = false) {
    return apiRequest(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, anonymous })
    });
  },
  async toggleCommentLike(commentId, reactionType = 'heart') {
    return apiRequest(`/comments/${commentId}/like`, {
      method: 'POST',
      body: JSON.stringify({ reactionType })
    });
  },
  async updateComment(commentId, content) {
    return apiRequest(`/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  },
  async deleteComment(commentId) {
    return apiRequest(`/comments/${commentId}`, { method: 'DELETE' });
  },
  async createRepost(postId) {
    return apiRequest(`/posts/${postId}/repost`, { method: 'POST' });
  }
};

const RecommendationsAPI = {
  async getUsers(weights = {}) {
    const params = new URLSearchParams();
    Object.entries(weights).forEach(([k, v]) => {
      if (v === null || v === undefined || Number.isNaN(Number(v))) return;
      params.set(k, String(v));
    });
    const qs = params.toString();
    return apiRequest(`/recommendations/users${qs ? `?${qs}` : ''}`);
  },
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

const MessagesAPI = {
  async getConversations() {
    return apiRequest('/messages/conversations');
  },
  async getMessages(withUserId) {
    const params = new URLSearchParams();
    params.set('withUser', String(withUserId));
    return apiRequest(`/messages?${params.toString()}`);
  },
  async sendMessage(toUserId, content) {
    return apiRequest('/messages', {
      method: 'POST',
      body: JSON.stringify({ toUserId, content })
    });
  }
};

const RoomsAPI = {
  async getRooms() {
    return apiRequest('/rooms');
  },
  async createRoom(options = {}) {
    return apiRequest('/rooms', {
      method: 'POST',
      body: JSON.stringify(options)
    });
  },
  async getRoom(roomId) {
    return apiRequest(`/rooms/${roomId}`);
  },
  async getRoomMessages(roomId, { limit = 50, offset = 0, afterId = null } = {}) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (afterId != null) params.set('afterId', String(afterId));
    return apiRequest(`/rooms/${roomId}/messages?${params.toString()}`);
  },
  async sendRoomMessage(roomId, content, { anonymous = false, replyToId = null } = {}) {
    return apiRequest(`/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, anonymous, replyToId })
    });
  },
  async toggleMessageReaction(roomId, messageId, emoji = 'heart') {
    return apiRequest(`/rooms/${roomId}/messages/${messageId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ emoji })
    });
  },
  async getTyping(roomId) {
    return apiRequest(`/rooms/${roomId}/typing`);
  },
  async setTyping(roomId, active = true) {
    return apiRequest(`/rooms/${roomId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ active })
    });
  },
  async joinRoom(roomId) {
    return apiRequest(`/rooms/${roomId}/join`, { method: 'POST' });
  },
  async getMuteStatus(roomId) {
    return apiRequest(`/rooms/${roomId}/mute-status`);
  },
  async muteUser(roomId, userId, minutes = 60) {
    return apiRequest(`/rooms/${roomId}/mute`, {
      method: 'POST',
      body: JSON.stringify({ userId, minutes })
    });
  },
  async getRoomMembers(roomId) {
    return apiRequest(`/rooms/${roomId}/members`);
  },
  async addRoomMembers(roomId, userIds) {
    return apiRequest(`/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds })
    });
  },
  async removeRoomMember(roomId, userId) {
    return apiRequest(`/rooms/${roomId}/members/${userId}`, { method: 'DELETE' });
  }
};

const StatsAPI = {
  async getNetworkStats() {
    return apiRequest('/stats');
  }
};

window.API = {
  User: UserAPI,
  Post: PostAPI,
  Recommendations: RecommendationsAPI,
  Messages: MessagesAPI,
  Rooms: RoomsAPI,
  Stats: StatsAPI
};
