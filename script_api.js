// Frontend module talking to REST API (replaces LocalStorage).

const I18n = window.I18n || {
  t: (k) => k,
  getLanguage: () => 'cs',
  setLanguage: () => {},
  apply: () => {}
};

let currentUser = null;
const usersCache = new Map();

const REC_WEIGHTS_STORAGE_KEY = 'recommendationWeights';
const THEME_STORAGE_KEY = 'appTheme';

function getTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch { return 'light'; }
}
function setTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
}
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  const label = document.getElementById('themeToggleLabel');
  if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
}
(function initTheme() {
  if (typeof document !== 'undefined' && document.documentElement) applyTheme(getTheme());
})();

const DEFAULT_RECOMMENDATION_WEIGHTS = {
  followersWeight: 1.0,
  commonFollowingWeight: 2.0,
  postsWeight: 0.5,
  likesWeight: 1.0,
  commentsWeight: 2.0,
  repostsWeight: 3.0,
  attentionWeight: 0.5,
  freshnessWeight: 2.0,
  authorAffinityWeight: 1.0,
  threadActivityWeight: 1.5,
  anonymityInterestWeight: 0.5,
  trendinessWeight: 1.0
};

const REC_WEIGHT_ICONS = {
  followersWeight: '👥',
  commonFollowingWeight: '🤝',
  postsWeight: '📝',
  likesWeight: '❤️',
  commentsWeight: '💬',
  repostsWeight: '🔁',
  attentionWeight: '👀',
  freshnessWeight: '⏰',
  authorAffinityWeight: '⭐',
  threadActivityWeight: '🧵',
  anonymityInterestWeight: '🎭',
  trendinessWeight: '🔥'
};

const REC_PRESETS = {
  latest: {
    nameKey: 'rec_preset_latest',
    name: 'Актуальное',
    weights: { freshnessWeight: 4, trendinessWeight: 1.5, likesWeight: 0.5, commentsWeight: 1, repostsWeight: 0.5, attentionWeight: 0.3, authorAffinityWeight: 0.5, threadActivityWeight: 0.5, anonymityInterestWeight: 0.3 }
  },
  popular: {
    nameKey: 'rec_preset_popular',
    name: 'Популярное',
    weights: { trendinessWeight: 4, likesWeight: 3, commentsWeight: 3, repostsWeight: 2, freshnessWeight: 1.5, attentionWeight: 0.5, authorAffinityWeight: 0.3, threadActivityWeight: 1, anonymityInterestWeight: 0.2 }
  },
  forYou: {
    nameKey: 'rec_preset_for_you',
    name: 'Тебе понравится',
    weights: { authorAffinityWeight: 4, anonymityInterestWeight: 2, attentionWeight: 2, likesWeight: 1.5, commentsWeight: 1.5, freshnessWeight: 1, trendinessWeight: 1, threadActivityWeight: 1 }
  },
  anonymous: {
    nameKey: 'rec_preset_anonymous',
    name: 'Анонимные сплетни',
    weights: { anonymityInterestWeight: 4, threadActivityWeight: 2, commentsWeight: 2, freshnessWeight: 1, likesWeight: 0.8, trendinessWeight: 0.8, authorAffinityWeight: 0.2, attentionWeight: 0.5 }
  },
  activeThreads: {
    nameKey: 'rec_preset_active_threads',
    name: 'Активные треды',
    weights: { threadActivityWeight: 4, commentsWeight: 3, attentionWeight: 2.5, likesWeight: 1, freshnessWeight: 1.5, trendinessWeight: 1, anonymityInterestWeight: 0.5, authorAffinityWeight: 0.5 }
  },
  combined: {
    nameKey: 'rec_preset_combined',
    name: 'Комбинированный',
    weights: { freshnessWeight: 1.5, trendinessWeight: 1.2, likesWeight: 1.2, commentsWeight: 1.5, repostsWeight: 1, attentionWeight: 0.8, authorAffinityWeight: 1.2, threadActivityWeight: 1.2, anonymityInterestWeight: 0.8 }
  }
};

let recommendationWeights = loadRecommendationWeights();
let currentFeedPresetId = 'latest';

const MOOD_EMOJI = { happy: '🙂', sad: '😢', inspired: '🔥', thinking: '🤔', dark: '💀' };
function getMoodEmoji(mood) {
  const m = (mood || 'happy').toLowerCase();
  return MOOD_EMOJI[m] || MOOD_EMOJI.happy;
}

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
  const panel = document.getElementById('recSettingsPanel');
  if (!panel) return;

  function applyWeightsToSliders(weights) {
    const w = weights || getRecommendationWeights();
    Object.keys(DEFAULT_RECOMMENDATION_WEIGHTS).forEach(key => {
      const input = document.getElementById(`w_${key}`);
      const val = document.getElementById(`w_${key}_val`);
      if (input && val) {
        const v = w[key] ?? DEFAULT_RECOMMENDATION_WEIGHTS[key];
        input.value = String(v);
        val.textContent = String(Number(v).toFixed(1));
      }
    });
  }

  function buildPanel() {
    panel.innerHTML = '';
    Object.keys(DEFAULT_RECOMMENDATION_WEIGHTS).forEach(key => {
      const def = DEFAULT_RECOMMENDATION_WEIGHTS[key];
      const icon = REC_WEIGHT_ICONS[key] || '•';
      const div = document.createElement('div');
      div.className = 'form-group rec-slider-row';
      div.innerHTML = `
        <label class="rec-slider-label" for="w_${key}">
          <span class="rec-slider-icon" title="${key}">${icon}</span>
          <span class="rec-slider-name">${key}</span>
          <span id="w_${key}_val" class="rec-slider-val">${def}</span>
        </label>
        <input id="w_${key}" type="range" min="0" max="10" step="0.1" value="${def}" class="rec-slider-input">
      `;
      panel.appendChild(div);
    });
  }

  function applyPreset(presetId) {
    currentFeedPresetId = presetId || 'latest';
    const preset = REC_PRESETS[presetId];
    if (!preset) return;
    const weights = { ...DEFAULT_RECOMMENDATION_WEIGHTS, ...preset.weights };
    recommendationWeights = { ...weights };
    saveRecommendationWeights();
    applyWeightsToSliders(recommendationWeights);
    if (onWeightsChange) onWeightsChange(getRecommendationWeights());
  }

  const presetsEl = document.getElementById('recPresets');
  if (presetsEl) {
    presetsEl.innerHTML = '';
    Object.keys(REC_PRESETS).forEach(id => {
      const preset = REC_PRESETS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ghost small rec-preset-btn';
      btn.textContent = I18n.t(preset.nameKey) || preset.name;
      btn.dataset.preset = id;
      btn.addEventListener('click', () => applyPreset(id));
      presetsEl.appendChild(btn);
    });
  }

  buildPanel();
  applyWeightsToSliders(getRecommendationWeights());

  const resetBtn = document.getElementById('recSettingsReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      recommendationWeights = { ...DEFAULT_RECOMMENDATION_WEIGHTS };
      saveRecommendationWeights();
      applyWeightsToSliders(recommendationWeights);
      if (onWeightsChange) onWeightsChange(getRecommendationWeights());
    });
  }

  let debounceTimer;
  const scheduleRefresh = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      onWeightsChange && onWeightsChange(getRecommendationWeights());
    }, 180);
  };

  Object.keys(DEFAULT_RECOMMENDATION_WEIGHTS).forEach(key => {
    const input = document.getElementById(`w_${key}`);
    const val = document.getElementById(`w_${key}_val`);
    if (!input || !val) return;
    input.addEventListener('input', () => {
      val.textContent = Number(input.value).toFixed(1);
      setRecommendationWeight(key, input.value);
      scheduleRefresh();
    });
  });
}

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

function updateFeedSubtitle() {
  const el = document.getElementById('feedSubtitlePhrase');
  if (el) {
    el.textContent = getRandomFeedSubtitle();
  }
}

function setupCollapsibleCards() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  document.querySelectorAll('.card-collapse-btn').forEach(btn => {
    const targetId = btn.getAttribute('data-collapse-target');
    const body = targetId ? document.getElementById(targetId) : null;
    if (!body) return;
    if (isMobile) {
      body.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  });
}

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

function runGlobalOnboarding(currentUser) {
  const OVERLAY_ID = 'onboardingOverlay';
  const STORAGE_KEY = 'onboarding_v1_done';
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch (_) {}
  const overlay = document.getElementById(OVERLAY_ID);
  const textEl = document.getElementById('onboardStepText');
  const nextBtn = document.getElementById('onboardNext');
  const skipBtn = document.getElementById('onboardSkip');
  if (!overlay || !textEl || !nextBtn || !skipBtn) return;
  const steps = [
    'onboard_step_feed',
    'onboard_step_create',
    'onboard_step_messages',
    'onboard_step_profile'
  ];
  let index = 0;
  function applyStep() {
    const key = steps[index] || steps[0];
    if (window.I18n && typeof I18n.t === 'function') {
      textEl.textContent = I18n.t(key) || textEl.textContent;
      nextBtn.textContent = index === steps.length - 1
        ? (I18n.t('onboard_finish') || 'Готово')
        : (I18n.t('onboard_next') || 'Далее');
      skipBtn.textContent = I18n.t('onboard_skip') || 'Пропустить';
    }
  }
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  applyStep();
  nextBtn.onclick = () => {
    if (index < steps.length - 1) {
      index += 1;
      applyStep();
    } else {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
    }
  };
  skipBtn.onclick = () => {
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
  };
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60) return (I18n && I18n.t('time_just_now')) ? I18n.t('time_just_now') : 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return min === 1 ? ((I18n && I18n.t('time_minute_ago')) ? I18n.t('time_minute_ago') : '1 min ago') : (min + ' min ago');
    const hours = Math.floor(min / 60);
    if (hours < 24) return hours === 1 ? ((I18n && I18n.t('time_hour_ago')) ? I18n.t('time_hour_ago') : '1 hour ago') : (hours + ' hours ago');
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? ((I18n && I18n.t('time_day_ago')) ? I18n.t('time_day_ago') : '1 day ago') : (days + ' days ago');
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return weeks === 1 ? ((I18n && I18n.t('time_week_ago')) ? I18n.t('time_week_ago') : '1 week ago') : (weeks + ' weeks ago');
    return formatDate(iso);
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

function emptyStateHTML(titleKey, textKey, icon) {
  const title = (I18n && I18n.t(titleKey)) ? I18n.t(titleKey) : 'No posts yet';
  const text = (I18n && I18n.t(textKey)) ? I18n.t(textKey) : 'Share your first moment — the community is waiting for your story.';
  const i = icon || '✨';
  return `<div class="empty-state">
    <div class="empty-state-icon">${i}</div>
    <div class="empty-state-title">${escapeHtml(title)}</div>
    <div class="empty-state-text">${escapeHtml(text)}</div>
  </div>`;
}

function getServerOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'file://') {
    return window.location.origin;
  }
  return 'http://localhost:5000';
}

function getFileUrl(filePath) {
  if (!filePath) return null;
  if (filePath.startsWith('http')) return filePath;
  const cleanPath = filePath.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/');
  return `${getServerOrigin()}/api/files/${cleanPath}`;
}

function isImageFile(file) {
  return file && file.type && file.type.startsWith('image/');
}

async function renderPost(post, currentUserId) {
  const isAnonymous = !!post.isAnonymous;
  const author = isAnonymous ? null : await getUserById(post.userId);
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

  const moodEmoji = getMoodEmoji(post.mood);
  const storyScore = author && (author.storyScore != null) ? author.storyScore : 0;
  const authorLink = isAnonymous ? '#' : (author ? `user.html?id=${author.id}` : '#');
  const displayName = isAnonymous ? (I18n.t('anonymous') || 'Anonymous') : (author ? author.username : '?');
  const anonymousColor = post.anonymousColor || '#6366f1';
  const avatarHtmlInner = isAnonymous
    ? `<span class="avatar avatar-anonymous" style="background:${anonymousColor}; color:#fff;">?</span>`
    : (author ? userAvatarHTML(author) : '?');

  div.innerHTML = `
    ${post.isRepost && !isAnonymous ? `<div class="post-repost-header muted" style="font-size: 0.85rem; margin-bottom: 4px;">↗ Reposted from <a href="user.html?id=${author ? author.id : ''}">@${author ? escapeHtml(author.username) : '?'}</a></div>` : ''}
    <div class="post-header">
      <div class="post-header-left">
        <a href="${isAnonymous ? '#' : authorLink}" class="post-avatar-link" aria-label="${escapeHtml(displayName)}">
          <span class="avatar">${avatarHtmlInner}</span>
        </a>
        <div>
          <strong>${isAnonymous ? '' : '<a href="' + authorLink + '">'}${escapeHtml(displayName)}${isAnonymous ? '' : '</a>'}</strong>
          <span class="post-mood" title="mood">${moodEmoji}</span>
          ${storyScore > 0 ? `<span class="post-story-score muted" style="font-size: 0.85rem;"> · Score ${storyScore}</span>` : ''}
          <div class="post-meta">${formatRelativeTime(post.createdAt)}</div>
          ${typeof post.score === 'number' ? `<span class="post-score-badge" title="${I18n.t('rec_score') || 'Рейтинг'}">🔥</span>` : ''}
        </div>
      </div>
      ${canDelete ? `<button class="link-button danger" data-action="delete">${deleteText}</button>` : ''}
    </div>
    <div class="post-content post-content-clickable" data-action="open-thread" data-post-id="${post.id}">${escapeHtml(post.content || '')}</div>
    ${attachmentHtml}
    <div class="post-actions" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div class="post-reactions" style="display: flex; align-items: center; gap: 4px;">
        ${reactionRow}
      </div>
      <div class="post-action-block" style="display: inline-flex; flex-direction: column; align-items: center;">
        <a href="thread.html?id=${post.id}" class="link-button post-action-btn" style="padding: 2px;">
          <img src="${iconsBase}/Comment.png" alt="Comment" class="post-action-icon">
        </a>
        <span class="post-action-count" data-action="comment">${commentsCount}</span>
      </div>
      <div class="post-action-block" style="display: inline-flex; flex-direction: column; align-items: center;">
        <button type="button" class="link-button post-action-btn" data-action="repost" style="padding: 2px;" ${reposted ? 'data-reposted="true"' : ''}>
          <img src="${iconsBase}/Repost.png" alt="Repost" class="post-action-icon">
        </button>
        <span class="post-action-count" data-action="repost">${repostsCount}</span>
      </div>
    </div>
  `;

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
      btn.classList.add('reaction-burst');
      setTimeout(() => btn.classList.remove('reaction-burst'), 400);
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

  div.querySelector('.post-content-clickable')?.addEventListener('click', () => { window.location.href = 'thread.html?id=' + post.id; });

  const repostBtn = div.querySelector('[data-action="repost"]');
  const repostCountEl = div.querySelector('.post-action-count[data-action="repost"]');
  repostBtn.addEventListener('click', async () => {
    try {
      const response = await window.API.Post.createRepost(post.id);
      if (response.success) {
        const nowReposted = response.reposted === true;
        repostBtn.setAttribute('data-reposted', nowReposted ? 'true' : '');
        repostBtn.classList.toggle('reposted', nowReposted);
        if (repostCountEl) repostCountEl.textContent = response.repostsCount != null ? response.repostsCount : (parseInt(repostCountEl.textContent, 10) || 0) + (nowReposted ? 1 : -1);
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  });

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

async function loadComments(postId, sort = 'latest', limit = 50, offset = 0, options = {}) {
  const { append = false, replyCallback = null } = options;
  try {
    const response = await window.API.Post.getComments(postId, sort, limit, offset);
    if (!response.success) return { totalCount: 0, loaded: 0 };
    const commentsList = document.getElementById(`comments-list-${postId}`);
    if (!commentsList) return { totalCount: response.totalCount || 0, loaded: (response.comments || []).length };
    const totalCount = response.totalCount != null ? response.totalCount : (response.comments || []).length;
    const comments = response.comments || [];

    if (!append) commentsList.innerHTML = '';
    if (comments.length === 0 && !append) {
      commentsList.innerHTML = '<p class="muted" style="font-size: 0.85rem;">Пока нет комментариев</p>';
      return { totalCount, loaded: 0 };
    }

    comments.forEach(comment => {
      const counts = comment.reactionCounts || { heart: 0, fire: 0, laugh: 0, wow: 0 };
      const curReaction = comment.currentUserReaction || null;
      const isOwn = currentUser && comment.userId === currentUser.id;
      const reactionRow = [
        { key: 'heart', emoji: '❤️' },
        { key: 'fire', emoji: '🔥' },
        { key: 'laugh', emoji: '😂' },
        { key: 'wow', emoji: '😮' }
      ].map(r => `
        <span style="display: inline-flex; align-items: center; gap: 2px;">
          <button type="button" class="comment-reaction-btn" data-comment-id="${comment.id}" data-reaction="${r.key}" ${curReaction === r.key ? 'data-active="1"' : ''} title="${r.key}">${r.emoji}</button>
          <span class="comment-reaction-count" data-reaction="${r.key}">${counts[r.key] || 0}</span>
        </span>
      `).join('');

      const commentDiv = document.createElement('div');
      commentDiv.className = 'comment-item';
      commentDiv.dataset.commentId = comment.id;
      commentDiv.style.cssText = 'padding: 8px; margin-bottom: 8px; border-radius: 6px;';
      const authorName = comment.isAnonymous ? (I18n.t('anonymous') || 'Anonymous') : escapeHtml(comment.username);
      const avatarHtml = comment.isAnonymous && comment.anonymousColor
        ? `<span class="avatar avatar-anonymous" style="background:${comment.anonymousColor}; color:#fff; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:0.8rem;">?</span>`
        : (comment.avatar ? `<img src="${getFileUrl(comment.avatar)}" alt="" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">` : `<span class="avatar" style="width:28px; height:28px;">${(comment.username || '?').charAt(0).toUpperCase()}</span>`);
      const replyBtnHtml = replyCallback ? `<button type="button" class="link-button comment-reply-btn" data-comment-id="${comment.id}" style="font-size: 0.8rem;">${I18n.t('comment_reply') || 'Ответить'}</button>` : '';
      const actionsHtml = isOwn
        ? `<span class="comment-actions" style="margin-left: auto;">${replyBtnHtml}
               <button type="button" class="link-button comment-edit-btn" data-comment-id="${comment.id}" style="font-size: 0.8rem;">${I18n.t('comment_edit') || 'Изменить'}</button>
               <button type="button" class="link-button comment-delete-btn" data-comment-id="${comment.id}" style="font-size: 0.8rem; color: var(--danger);">${I18n.t('comment_delete') || 'Удалить'}</button>
             </span>`
        : `<span class="comment-actions" style="margin-left: auto;">${replyBtnHtml}</span>`;
      commentDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
          ${avatarHtml}
          <strong style="font-size: 0.9rem;">${authorName}</strong>
          <span class="muted" style="font-size: 0.75rem;">${formatRelativeTime(comment.createdAt)}</span>
          ${actionsHtml}
        </div>
        <div class="comment-body" style="font-size: 0.9rem;">${escapeHtml(comment.content)}</div>
        <div class="comment-edit-form" style="display: none; margin-top: 6px;">
          <textarea class="comment-input comment-edit-input" rows="2" style="width: 100%; margin-top: 4px; resize: vertical;"></textarea>
          <div style="margin-top: 6px;">
            <button type="button" class="btn primary small comment-save-btn" data-comment-id="${comment.id}">${I18n.t('save') || 'Сохранить'}</button>
            <button type="button" class="btn ghost small comment-cancel-btn" data-comment-id="${comment.id}">${I18n.t('cancel') || 'Отмена'}</button>
          </div>
        </div>
        <div class="comment-reactions" style="display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
          ${reactionRow}
        </div>
      `;
      commentsList.appendChild(commentDiv);

      if (replyCallback) {
        const replyBtn = commentDiv.querySelector('.comment-reply-btn');
        if (replyBtn) replyBtn.addEventListener('click', () => replyCallback(comment.id, comment));
      }

      if (isOwn) {
          const editBtn = commentDiv.querySelector('.comment-edit-btn');
          const deleteBtn = commentDiv.querySelector('.comment-delete-btn');
          const bodyEl = commentDiv.querySelector('.comment-body');
          const formEl = commentDiv.querySelector('.comment-edit-form');
          const inputEl = commentDiv.querySelector('.comment-edit-input');
          const saveBtn = commentDiv.querySelector('.comment-save-btn');
          const cancelBtn = commentDiv.querySelector('.comment-cancel-btn');

          editBtn.addEventListener('click', () => {
            inputEl.value = comment.content;
            bodyEl.style.display = 'none';
            formEl.style.display = 'block';
            inputEl.focus();
          });

          cancelBtn.addEventListener('click', () => {
            formEl.style.display = 'none';
            bodyEl.style.display = '';
          });

          saveBtn.addEventListener('click', async () => {
            const newContent = inputEl.value.trim();
            if (!newContent) return;
            try {
              const resp = await window.API.Post.updateComment(comment.id, newContent);
              if (resp.success && resp.comment) {
                bodyEl.textContent = resp.comment.content;
                bodyEl.style.display = '';
                formEl.style.display = 'none';
                comment.content = resp.comment.content;
              }
            } catch (err) {
              console.error(err);
              alert(I18n.t('error_save_comment') || 'Не удалось сохранить комментарий');
            }
          });

          deleteBtn.addEventListener('click', async () => {
            if (!confirm(I18n.t('comment_delete_confirm') || 'Удалить комментарий?')) return;
            try {
              const resp = await window.API.Post.deleteComment(comment.id);
              if (resp.success) {
                commentDiv.remove();
                const commentCountEl = document.querySelector(`#comments-${postId}`)?.closest('.post')?.querySelector('.post-action-count[data-action="comment"]');
                if (commentCountEl) {
                  const n = Math.max(0, (parseInt(commentCountEl.textContent, 10) || 0) - 1);
                  commentCountEl.textContent = n;
                }
                const threadCountEl = document.getElementById('threadCommentsCount');
                if (threadCountEl) {
                  const list = document.getElementById('comments-list-' + postId);
                  threadCountEl.textContent = list ? list.querySelectorAll('.comment-item').length : 0;
                }
                const list = document.getElementById(`comments-list-${postId}`);
                if (list && list.querySelectorAll('.comment-item').length === 0) {
                  list.innerHTML = '<p class="muted" style="font-size: 0.85rem;">Пока нет комментариев</p>';
                }
              }
            } catch (err) {
              console.error(err);
              alert(I18n.t('error_delete_comment') || 'Не удалось удалить комментарий');
            }
          });
        }

        commentDiv.querySelectorAll('.comment-reaction-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const cid = btn.dataset.commentId;
            const reactionType = btn.dataset.reaction;
            try {
              const resp = await window.API.Post.toggleCommentLike(cid, reactionType);
              if (resp.success) {
                ['heart', 'fire', 'laugh', 'wow'].forEach(key => {
                  const span = commentDiv.querySelector(`.comment-reaction-count[data-reaction="${key}"]`);
                  if (span) span.textContent = (resp.reactionCounts && resp.reactionCounts[key]) || 0;
                });
                commentDiv.querySelectorAll('.comment-reaction-btn').forEach(b => {
                  const k = b.dataset.reaction;
                  b.classList.toggle('reaction-active', resp.currentUserReaction === k);
                  b.setAttribute('data-active', resp.currentUserReaction === k ? '1' : '0');
                });
                commentDiv.querySelectorAll('.comment-reaction-count').forEach(span => span.classList.add('reaction-count-update'));
                setTimeout(() => commentDiv.querySelectorAll('.comment-reaction-count').forEach(s => s.classList.remove('reaction-count-update')), 400);
              }
            } catch (err) {
              console.error(err);
            }
          });
        });
    });
    return { totalCount, loaded: comments.length };
  } catch (error) {
    console.error('Ошибка загрузки комментариев:', error);
    return { totalCount: 0, loaded: 0 };
  }
}

const App = {
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

  async renderThreadPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (window.I18n && I18n.apply) I18n.apply(document);

    const params = new URLSearchParams(window.location.search);
    const postId = params.get('id');
    const threadError = document.getElementById('threadError');
    const threadPostWrap = document.getElementById('threadPostWrap');
    const threadCommentsCard = document.getElementById('threadCommentsCard');
    const threadShareWrap = document.getElementById('threadShareWrap');

    if (!postId) {
      if (threadError) { threadError.style.display = 'block'; threadError.textContent = I18n.t('thread_not_found') || 'Пост не указан.'; }
      return;
    }

    try {
      const res = await window.API.Post.getPost(postId);
      if (!res.success || !res.post) {
        if (threadError) { threadError.style.display = 'block'; threadError.textContent = I18n.t('thread_not_found') || 'Пост не найден.'; }
        return;
      }
      const post = res.post;
      const currentUserId = currentUser ? currentUser.id : null;
      const isAnonymous = !!post.isAnonymous;
      const author = isAnonymous ? null : await getUserById(post.userId);
      const displayName = isAnonymous ? (I18n.t('anonymous') || 'Anonymous') : (author ? author.username : '?');
      const anonymousColor = post.anonymousColor || '#6366f1';
      const avatarHtml = isAnonymous
        ? `<span class="avatar avatar-anonymous" style="background:${anonymousColor}; color:#fff;">?</span>`
        : (author ? userAvatarHTML(author) : '?');
      const authorLink = isAnonymous ? '#' : (author ? `user.html?id=${author.id}` : '#');
      const reactionCounts = post.reactionCounts || { heart: 0, fire: 0, laugh: 0, wow: 0 };
      const moodEmoji = getMoodEmoji(post.mood);
      let attachmentHtml = '';
      if (post.files && post.files.length > 0) {
        const file = post.files[0];
        const fileUrl = getFileUrl(file.filePath);
        const safeName = escapeHtml(file.fileName);
        if (file.fileType === 'image' && fileUrl) {
          attachmentHtml = `<div class="post-attachment"><img src="${fileUrl}" alt="${safeName}" style="max-width:100%; border-radius:8px; margin-top:8px;"></div>`;
        } else if (fileUrl) {
          attachmentHtml = `<div class="post-attachment"><a href="${fileUrl}" download="${safeName}" target="_blank">${I18n.t('attachment_download') || 'Скачать'} (${safeName})</a></div>`;
        }
      }
      const reactionRow = ['heart','fire','laugh','wow'].map(key => ({
        key,
        emoji: { heart: '❤️', fire: '🔥', laugh: '😂', wow: '😮' }[key]
      })).map(r => `
        <div class="post-reaction-item" style="display:inline-flex; flex-direction:column; align-items:center; margin-right:8px;">
          <button type="button" class="reaction-button" data-reaction="${r.key}" ${post.currentUserReaction === r.key ? 'data-active="1"' : ''}>${r.emoji}</button>
          <span class="reaction-count" data-reaction="${r.key}">${reactionCounts[r.key] || 0}</span>
        </div>
      `).join('');

      threadPostWrap.innerHTML = `
        <div class="post-header">
          <div class="post-header-left">
            <a href="${authorLink}" class="post-avatar-link"><span class="avatar">${avatarHtml}</span></a>
            <div>
              <strong>${isAnonymous ? '' : '<a href="' + authorLink + '">'}${escapeHtml(displayName)}${isAnonymous ? '' : '</a>'}</strong>
              <span class="post-mood">${moodEmoji}</span>
              <div class="post-meta">${formatRelativeTime(post.createdAt)}</div>
            </div>
          </div>
        </div>
        <div class="post-content">${escapeHtml(post.content || '')}</div>
        ${attachmentHtml}
        <div class="post-actions" style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
          <div class="post-reactions" style="display:flex; align-items:center; gap:4px;">${reactionRow}</div>
          <span class="post-action-count" data-action="comment">${post.commentsCount || 0}</span>
        </div>
      `;
      threadPostWrap.style.display = 'block';

      threadPostWrap.querySelectorAll('.reaction-button').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reactionType = btn.dataset.reaction;
          try {
            const response = await window.API.Post.toggleLike(post.id, reactionType);
            if (response.success) {
              ['heart','fire','laugh','wow'].forEach(k => {
                const s = threadPostWrap.querySelector(`.reaction-count[data-reaction="${k}"]`);
                if (s) s.textContent = (response.reactionCounts && response.reactionCounts[k]) || 0;
              });
              threadPostWrap.querySelectorAll('.reaction-button').forEach(b => {
                b.classList.toggle('reaction-active', b.dataset.reaction === response.currentUserReaction);
                b.setAttribute('data-active', b.dataset.reaction === response.currentUserReaction ? '1' : '0');
              });
            }
          } catch (e) { console.error(e); }
        });
      });

      threadCommentsCard.style.display = 'block';
      threadShareWrap.style.display = 'block';
      const threadCommentsCount = document.getElementById('threadCommentsCount');
      const threadCommentsList = document.getElementById('threadCommentsList');
      const threadCommentsSort = document.getElementById('threadCommentsSort');
      const threadCommentsBody = document.getElementById('threadCommentsBody');
      const threadCommentsToggle = document.getElementById('threadCommentsToggle');
      const threadShareCopy = document.getElementById('threadShareCopy');
      const threadShareCopied = document.getElementById('threadShareCopied');
      const floatingPanel = document.getElementById('floatingCommentPanel');
      const floatingReplyRef = document.getElementById('floatingCommentReplyRef');
      const floatingInput = document.getElementById('floatingCommentInput');
      const floatingAnonymous = document.getElementById('floatingCommentAnonymous');
      const floatingSubmit = document.getElementById('floatingCommentSubmit');
      const floatingEmojiBtn = document.getElementById('floatingCommentEmoji');
      const floatingEmojiPicker = document.getElementById('floatingEmojiPicker');
      const threadLoadMoreWrap = document.getElementById('threadLoadMoreWrap');
      const threadLoadMore = document.getElementById('threadLoadMore');

      if (threadCommentsCount) threadCommentsCount.textContent = post.commentsCount || 0;
      threadCommentsList.id = 'comments-list-' + postId;

      const COMMENT_PAGE_SIZE = 15;
      let threadCommentsOffset = 0;
      let threadCommentsTotalCount = 0;
      let replyToCommentId = null;
      let replyHighlightTimer = null;

      const setPlaceholder = () => {
        if (floatingInput) floatingInput.placeholder = (window.I18n && I18n.t('comment_placeholder')) || 'Написать комментарий...';
      };
      setPlaceholder();

      if (floatingPanel) {
        floatingPanel.classList.add('floating-comment-panel--visible');
        floatingPanel.setAttribute('aria-hidden', 'false');
      }

      const clearReplyRef = () => {
        replyToCommentId = null;
        if (floatingReplyRef) { floatingReplyRef.style.display = 'none'; floatingReplyRef.innerHTML = ''; }
        document.querySelectorAll('.comment-item.highlight').forEach(el => el.classList.remove('highlight'));
      };

      const replyCallback = (commentId, comment) => {
        replyToCommentId = commentId;
        const snippet = (comment.content || '').slice(0, 40);
        if (floatingReplyRef) {
          const clearLabel = (window.I18n && I18n.t('cancel')) || 'Отмена';
          floatingReplyRef.innerHTML = `Ответ на #${commentId} <span class="floating-comment-reply-clear" role="button" tabindex="0">${clearLabel}</span>`;
          floatingReplyRef.style.display = 'block';
          floatingReplyRef.querySelector('.floating-comment-reply-clear').addEventListener('click', clearReplyRef);
        }
        const prefix = `>>#${commentId} `;
        if (floatingInput) {
          floatingInput.value = prefix + (floatingInput.value || '').trimStart();
          floatingInput.focus();
        }
        document.querySelectorAll('.comment-item.highlight').forEach(el => el.classList.remove('highlight'));
        const el = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
        if (el) {
          el.classList.add('highlight');
          if (replyHighlightTimer) clearTimeout(replyHighlightTimer);
          replyHighlightTimer = setTimeout(() => el.classList.remove('highlight'), 1500);
        }
        floatingPanel && floatingPanel.scrollIntoView({ behavior: 'smooth', block: 'end' });
      };

      const sendFloatingComment = async () => {
        let content = floatingInput ? floatingInput.value.trim() : '';
        if (!content) return;
        if (replyToCommentId && !content.startsWith('>>#')) content = `>>#${replyToCommentId} ${content}`;
        const anonymous = floatingAnonymous ? floatingAnonymous.checked : false;
        try {
          const response = await window.API.Post.createComment(post.id, content, anonymous);
          if (response.success) {
            floatingInput.value = '';
            clearReplyRef();
            threadCommentsTotalCount = (threadCommentsTotalCount || 0) + 1;
            if (threadCommentsCount) threadCommentsCount.textContent = threadCommentsTotalCount;
            const sort = threadCommentsSort ? threadCommentsSort.value : 'latest';
            threadCommentsList.innerHTML = '';
            threadCommentsOffset = 0;
            const { totalCount } = await loadComments(postId, sort, COMMENT_PAGE_SIZE, 0, { replyCallback });
            threadCommentsTotalCount = totalCount;
            if (threadCommentsCount) threadCommentsCount.textContent = totalCount;
            if (threadLoadMoreWrap) threadLoadMoreWrap.style.display = totalCount > COMMENT_PAGE_SIZE ? 'block' : 'none';
          }
        } catch (e) { alert(I18n.t('error_save_comment') || 'Ошибка отправки: ' + e.message); }
      };

      if (floatingSubmit) floatingSubmit.addEventListener('click', sendFloatingComment);
      if (floatingInput) {
        floatingInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendFloatingComment();
          }
        });
        floatingInput.addEventListener('focus', () => floatingInput.classList.add('focus-expanded'));
        floatingInput.addEventListener('blur', () => floatingInput.classList.remove('focus-expanded'));
      }

      const EMOJI_LIST = ['😀','😁','😂','😊','😎','😢','😭','😡','👍','👎','❤️','🔥','💬','👀','🙏','✨','🎉','🤔','😮','👏'];
      if (floatingEmojiPicker) {
        EMOJI_LIST.forEach(emoji => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = emoji;
          btn.addEventListener('click', () => {
            if (floatingInput) {
              const start = floatingInput.selectionStart;
              const end = floatingInput.selectionEnd;
              const v = floatingInput.value;
              floatingInput.value = v.slice(0, start) + emoji + v.slice(end);
              floatingInput.selectionStart = floatingInput.selectionEnd = start + emoji.length;
              floatingInput.focus();
            }
            floatingEmojiPicker.style.display = 'none';
          });
          floatingEmojiPicker.appendChild(btn);
        });
      }
      if (floatingEmojiBtn && floatingEmojiPicker) {
        floatingEmojiBtn.addEventListener('click', () => {
          floatingEmojiPicker.style.display = floatingEmojiPicker.style.display === 'none' ? 'block' : 'none';
        });
      }

      const refreshThreadComments = async (append = false) => {
        const sort = threadCommentsSort ? threadCommentsSort.value : 'latest';
        const offset = append ? threadCommentsOffset : 0;
        if (!append) {
          threadCommentsList.innerHTML = '';
          threadCommentsOffset = 0;
        }
        const { totalCount, loaded } = await loadComments(postId, sort, COMMENT_PAGE_SIZE, offset, { append, replyCallback });
        if (!append) threadCommentsTotalCount = totalCount;
        threadCommentsOffset = append ? threadCommentsOffset + loaded : loaded;
        if (threadCommentsCount) threadCommentsCount.textContent = totalCount;
        if (threadLoadMoreWrap) threadLoadMoreWrap.style.display = totalCount > COMMENT_PAGE_SIZE && threadCommentsOffset < totalCount ? 'block' : 'none';
      };

      await refreshThreadComments(false);

      if (threadLoadMore) {
        threadLoadMore.addEventListener('click', () => refreshThreadComments(true));
      }

      if (threadCommentsSort) threadCommentsSort.addEventListener('change', () => refreshThreadComments(false));
      if (threadCommentsToggle && threadCommentsBody) {
        threadCommentsToggle.addEventListener('click', () => {
          threadCommentsBody.classList.toggle('collapsed');
          threadCommentsToggle.textContent = threadCommentsBody.classList.contains('collapsed')
            ? (I18n.t('thread_expand') || 'Развернуть')
            : (I18n.t('thread_collapse') || 'Свернуть');
        });
      }
      if (threadShareCopy && threadShareCopied) {
        threadShareCopy.addEventListener('click', () => {
          const url = window.location.href;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
              threadShareCopied.style.display = 'inline';
              setTimeout(() => { threadShareCopied.style.display = 'none'; }, 2000);
            });
          } else {
            threadShareCopied.textContent = url;
            threadShareCopied.style.display = 'inline';
          }
        });
      }
    } catch (e) {
      if (threadError) { threadError.style.display = 'block'; threadError.textContent = e.message || 'Ошибка загрузки.'; }
    }
  },

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

    try {
      const user = await getCurrentUser();
      if (user) {
        window.location.href = 'feed.html';
      }
    } catch (error) {
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

    const recAdminUsernames = ['HrishynM', 'MachalikD'];
    const isRecAdmin = recAdminUsernames.includes((currentUser.username || '').trim());
    const recPanel = document.getElementById('recSettingsPanel');
    const recReset = document.getElementById('recSettingsReset');
    if (recPanel) recPanel.style.display = isRecAdmin ? '' : 'none';
    if (recReset) recReset.style.display = isRecAdmin ? '' : 'none';

    await this.renderMiniProfile(currentUser);

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
        container.innerHTML = '<p class="muted">' + (I18n.t('no_users_yet') || 'No users yet') + '</p>';
      }
    } catch (e) { /* ignore */ }

    setupCollapsibleCards();

    const postForm = document.getElementById('postForm');
    const postContent = document.getElementById('postContent');
    const postFile = document.getElementById('postFile');
    const postFileStatus = document.getElementById('postFileStatus');
    let postImageBlob = null;

    if (postForm && postContent) {
      postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContent.value.trim();
        const moodInput = document.querySelector('input[name="postMood"]:checked');
        const mood = moodInput ? moodInput.value : 'happy';
        const anonymousEl = document.getElementById('postAnonymous');
        const anonymous = anonymousEl ? anonymousEl.checked : false;
        const rawFile = postFile && postFile.files ? postFile.files[0] : null;
        const file = postImageBlob
          ? new File([postImageBlob], (rawFile && rawFile.name) || 'image.jpg', { type: postImageBlob.type })
          : rawFile;

        if (!content && !file) return;

        try {
          const response = await window.API.Post.createPost(content, file, mood, anonymous);
          if (response.success) {
            postContent.value = '';
            if (postFile) postFile.value = '';
            postImageBlob = null;
            if (postFileStatus) postFileStatus.textContent = '';
            await this.refreshCurrentPage();
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }

    if (postFile && postFileStatus) {
      postFile.addEventListener('change', async () => {
        if (!postFile.files || !postFile.files[0]) {
          postImageBlob = null;
          postFileStatus.textContent = '';
          return;
        }
        const file = postFile.files[0];
        if (file.type && file.type.startsWith('image/') && window.openImageCrop) {
          try {
            const cropped = await window.openImageCrop(file);
            postImageBlob = cropped instanceof Blob ? cropped : null;
            postFileStatus.textContent = (I18n.t('attachment_label') || 'Фото') + ': ' + (cropped instanceof File ? cropped.name : file.name);
          } catch (err) {
            postImageBlob = file;
            postFileStatus.textContent = file.name;
          }
        } else {
          postImageBlob = null;
          postFileStatus.textContent = file.name;
        }
      });
    }

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

    this.refreshCurrentPage = async () => {
      const weights = getRecommendationWeights();
      await this.renderFeedPosts(currentUser.id, weights);
      if (searchInput) {
        await this.renderSearchResults(searchInput.value, currentUser.id);
      }
      await this.renderRecommendations(currentUser.id, weights);
      const indicator = document.getElementById('feedPresetIndicator');
      if (indicator) {
        const preset = REC_PRESETS[currentFeedPresetId];
        indicator.textContent = preset ? (I18n.t(preset.nameKey) || preset.name) : '';
      }
    };

    await this.refreshCurrentPage();

    runGlobalOnboarding(currentUser);

    const feedSwipeArea = document.getElementById('feedSwipeArea');
    if (feedSwipeArea && typeof setupRecommendationSettingsPanel === 'function') {
      const SWIPE_PRESETS = ['latest', 'popular', 'forYou'];
      let touchStartX = 0;
      feedSwipeArea.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
      feedSwipeArea.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const delta = touchStartX - touchEndX;
        if (Math.abs(delta) < 60) return;
        const idx = SWIPE_PRESETS.indexOf(currentFeedPresetId);
        if (idx === -1) return;
        const nextIdx = delta > 0 ? (idx + 1) % SWIPE_PRESETS.length : (idx - 1 + SWIPE_PRESETS.length) % SWIPE_PRESETS.length;
        const nextId = SWIPE_PRESETS[nextIdx];
        const presetsEl = document.getElementById('recPresets');
        const btn = presetsEl && presetsEl.querySelector(`[data-preset="${nextId}"]`);
        if (btn) btn.click();
      }, { passive: true });
    }
  },

  /**
   * Рендерит посты в ленте
   */
  async renderFeedPosts(currentUserId, weights = null) {
    const container = document.getElementById('postsContainer');
    if (!container) return;
    container.innerHTML = '<p class="muted">Загрузка...</p>';

    try {
      const response = await window.API.Recommendations.getPosts(weights || getRecommendationWeights());
      if (response.success) {
        container.innerHTML = '';
        if (response.posts.length === 0) {
          container.innerHTML = emptyStateHTML('empty_posts_title', 'empty_posts_text', '✨');
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

        const followingMap = new Map();
        try {
          const followersResponse = await window.API.User.getFollowing(currentUserId);
          if (followersResponse.success) {
            followersResponse.users.forEach(u => followingMap.set(u.id, true));
          }
        } catch (error) {
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

    const profileCard = document.getElementById('profileCard');
    const gradientSelect = document.getElementById('profileGradient');

    function applyProfileGradient() {
      const key = (currentUser.profileGradient || '').trim();
      if (!profileCard) return;
      profileCard.classList.remove(
        'profile-card--gradient-sunset',
        'profile-card--gradient-ocean',
        'profile-card--gradient-aurora',
        'profile-card--gradient-violet',
        'profile-card--gradient-emerald'
      );
      if (key) {
        profileCard.classList.add('profile-card--gradient-' + key);
      }
      if (gradientSelect) gradientSelect.value = key;
    }
    applyProfileGradient();

    try {
      const statsResponse = await window.API.User.getUserStats(currentUser.id);
      if (statsResponse.success) {
        const stats = statsResponse.stats;
        const postsCountEl = document.getElementById('postsCount');
        const followersCountEl = document.getElementById('followersCount');
        const followingCountEl = document.getElementById('followingCount');
        const storyScoreEl = document.getElementById('storyScoreCount');

        if (postsCountEl) postsCountEl.textContent = stats.postsCount;
        if (followersCountEl) followersCountEl.textContent = stats.followersCount;
        if (followingCountEl) followingCountEl.textContent = stats.followingCount;
        if (storyScoreEl) storyScoreEl.textContent = stats.storyScore != null ? stats.storyScore : 0;
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }

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

    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
      avatarInput.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        const toUpload = window.openImageCrop ? await window.openImageCrop(file) : file;
        const fileToSend = toUpload instanceof Blob && !(toUpload instanceof File) ? new File([toUpload], file.name, { type: toUpload.type }) : toUpload;
        try {
          const response = await window.API.User.updateProfile(null, fileToSend);
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
        avatarInput.value = '';
      });
    }

    const profileGradientSave = document.getElementById('profileGradientSave');
    if (profileGradientSave && gradientSelect) {
      profileGradientSave.addEventListener('click', async () => {
        const gradient = (gradientSelect.value || '').trim();
        try {
          const response = await window.API.User.updateProfile(currentUser.bio || null, null, gradient);
          if (response.success && response.user) {
            currentUser.profileGradient = response.user.profileGradient;
            applyProfileGradient();
          }
        } catch (error) {
          alert('Ошибка: ' + error.message);
        }
      });
    }

    const userPostsContainer = document.getElementById('userPostsContainer');
    if (userPostsContainer) {
      userPostsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
      try {
        const postsResponse = await window.API.Post.getPosts(currentUser.id);
        const posts = Array.isArray(postsResponse?.posts) ? postsResponse.posts : [];
        userPostsContainer.innerHTML = '';
        if (posts.length === 0) {
          userPostsContainer.innerHTML = emptyStateHTML('empty_posts_title', 'empty_posts_text', '✨');
        } else {
          for (const post of posts) {
            try {
              const el = await renderPost(post, currentUser.id);
              userPostsContainer.appendChild(el);
            } catch (err) {
              console.error('Ошибка отрисовки поста:', post?.id, err);
            }
          }
        }
      } catch (error) {
        userPostsContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
      }
    }

    this.refreshCurrentPage = async () => {
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

      if (userPostsContainer) {
        userPostsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
        try {
          const postsResponse = await window.API.Post.getPosts(currentUser.id);
          const posts = Array.isArray(postsResponse?.posts) ? postsResponse.posts : [];
          userPostsContainer.innerHTML = '';
          if (posts.length === 0) {
            userPostsContainer.innerHTML = emptyStateHTML('empty_posts_title', 'empty_posts_text', '✨');
          } else {
            for (const post of posts) {
              try {
                const el = await renderPost(post, currentUser.id);
                userPostsContainer.appendChild(el);
              } catch (err) {
                console.error('Ошибка отрисовки поста:', post?.id, err);
              }
            }
          }
        } catch (error) {
          userPostsContainer.innerHTML = `<p class="error-text">Ошибка загрузки: ${error.message}</p>`;
        }
      }
    };

    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');
    if (followersLink) {
      followersLink.href = `relations.html?type=followers&id=${currentUser.id}`;
    }
    if (followingLink) {
      followingLink.href = `relations.html?type=following&id=${currentUser.id}`;
    }
  },

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

    try {
      const statsResponse = await window.API.User.getUserStats(viewedUserId);
      if (statsResponse.success) {
        const stats = statsResponse.stats;
        const postsCountEl = document.getElementById('viewPostsCount');
        const followersCountEl = document.getElementById('viewFollowersCount');
        const followingCountEl = document.getElementById('viewFollowingCount');
        const viewStoryScoreEl = document.getElementById('viewStoryScoreCount');

        if (postsCountEl) postsCountEl.textContent = stats.postsCount;
        if (followersCountEl) followersCountEl.textContent = stats.followersCount;
        if (followingCountEl) followingCountEl.textContent = stats.followingCount;
        if (viewStoryScoreEl) viewStoryScoreEl.textContent = stats.storyScore != null ? stats.storyScore : 0;
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }

    const followBtn = document.getElementById('followBtn');
    if (followBtn && String(currentUser.id) !== String(viewedUserId)) {
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

    const postsContainer = document.getElementById('viewUserPostsContainer');
    if (postsContainer) {
      postsContainer.innerHTML = '<p class="muted">Загрузка...</p>';
      try {
        const postsResponse = await window.API.Post.getPosts(viewedUserId);
        if (postsResponse.success) {
          postsContainer.innerHTML = '';
          if (postsResponse.posts.length === 0) {
            postsContainer.innerHTML = emptyStateHTML('empty_posts_title', 'empty_posts_text', '✨');
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

    const viewFollowersLink = document.getElementById('viewFollowersLink');
    const viewFollowingLink = document.getElementById('viewFollowingLink');
    if (viewFollowersLink) {
      viewFollowersLink.href = `relations.html?type=followers&id=${viewedUserId}`;
    }
    if (viewFollowingLink) {
      viewFollowingLink.href = `relations.html?type=following&id=${viewedUserId}`;
    }
  },

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

    const chatPlaceholder = document.getElementById('messagesChatPlaceholder');
    const chatPanel = document.getElementById('messagesChatPanel');
    const convHeaderAvatar = document.getElementById('messagesChatHeaderAvatar');
    const convHeaderName = document.getElementById('messagesChatHeaderName');
    const convHeaderStatus = document.getElementById('messagesChatHeaderStatus');

    let selectedUser = null;
    const POLLING_INTERVAL_MS = 2500;
    const MESSAGES_LAST_SEEN_KEY = 'messagesLastSeen';
    const ONLINE_THRESHOLD_SEC = 120;
    let lastLoadedMessageIds = new Set();
    let pollingTimer = null;

    function getLastSeenMap() {
      try {
        const raw = localStorage.getItem(MESSAGES_LAST_SEEN_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    }
    function setLastSeen(partnerId, messageId) {
      const map = getLastSeenMap();
      map[String(partnerId)] = messageId;
      try { localStorage.setItem(MESSAGES_LAST_SEEN_KEY, JSON.stringify(map)); } catch {}
    }
    function getLastSeen(partnerId) { return getLastSeenMap()[String(partnerId)] || 0; }

    function isUserOnline(user) {
      const lastActive = user && user.lastActive;
      if (!lastActive) return false;
      try {
        return (Date.now() - new Date(lastActive).getTime()) / 1000 < ONLINE_THRESHOLD_SEC;
      } catch { return false; }
    }

    function formatMessageTime(iso) {
      try {
        const d = new Date(iso);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    }

    function selectUserAndLoad(u, highlightEl) {
      selectedUser = u;
      if (chatPlaceholder) chatPlaceholder.style.display = 'none';
      if (chatPanel) chatPanel.style.display = 'flex';
      if (convHeaderName) convHeaderName.textContent = u.username;
      if (convHeaderAvatar) {
        convHeaderAvatar.innerHTML = u.avatar
          ? `<img src="${u.avatar.startsWith('http') ? u.avatar : getServerOrigin() + '/api/files/' + u.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/')}" alt="">`
          : `<span class="conv-avatar-letter">${(u.username || '?').charAt(0).toUpperCase()}</span>`;
      }
      if (convHeaderStatus) {
        const online = isUserOnline(u);
        convHeaderStatus.textContent = online ? (I18n.t('online') || 'Online') : (I18n.t('offline') || 'Offline');
        convHeaderStatus.classList.toggle('online', online);
      }
      loadConversation(u.id, u.username, true);
      [conversationsList, recommendationsList, usersList].forEach(el => {
        if (!el) return;
        el.querySelectorAll('.messages-conv-item').forEach(item => item.classList.remove('selected'));
      });
      if (highlightEl) highlightEl.classList.add('selected');
      refreshConversationsList();
    }

    function renderConversationItem(u, container) {
      if (!container) return;
      const preview = u.lastMessageContent
        ? (String(u.lastMessageFromUserId) === String(currentUser.id) ? (I18n.t('you') || 'You') + ': ' : '') + (u.lastMessageContent.length > 35 ? u.lastMessageContent.slice(0, 35) + '…' : u.lastMessageContent)
        : (I18n.t('no_messages') || 'No messages yet');
      const timeStr = u.lastMessageAt ? formatMessageTime(u.lastMessageAt) : '';
      const online = isUserOnline(u);
      const lastSeenId = getLastSeen(u.id);
      const hasUnread = u.lastMessageId != null && u.lastMessageId > lastSeenId && String(u.lastMessageFromUserId) === String(u.id);
      const avatarHtml = u.avatar
        ? `<img class="conv-avatar" src="${u.avatar.startsWith('http') ? u.avatar : getServerOrigin() + '/api/files/' + u.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/')}" alt="">`
        : `<span class="conv-avatar-letter">${(u.username || '?').charAt(0).toUpperCase()}</span>`;
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'messages-conv-item' + (selectedUser && String(selectedUser.id) === String(u.id) ? ' selected' : '');
      div.innerHTML = `
        <span class="conv-avatar-wrap">${avatarHtml}</span>
        <div class="conv-body">
          <div class="conv-meta">
            <span class="conv-name"><span class="messages-status-dot ${online ? 'online' : 'offline'}"></span>${escapeHtml(u.username)}</span>
            ${timeStr ? `<span class="conv-time">${timeStr}</span>` : ''}
          </div>
          <div class="conv-preview">${escapeHtml(preview)}</div>
        </div>
        ${hasUnread ? '<span class="messages-unread-dot"></span>' : ''}
      `;
      div.addEventListener('click', () => selectUserAndLoad(u, div));
      container.appendChild(div);
    }

    function renderBubble(msg, isOwn, avatarHtml) {
      const wrap = document.createElement('div');
      wrap.className = 'messages-bubble-wrap ' + (isOwn ? 'own' : 'other');
      wrap.dataset.messageId = msg.id;
      wrap.innerHTML = `
        <span class="messages-bubble-avatar">${avatarHtml || ''}</span>
        <div class="messages-bubble">
          <div class="messages-bubble-text">${escapeHtml(msg.content || '')}</div>
          <div class="messages-bubble-time">${formatMessageTime(msg.createdAt)}</div>
        </div>
      `;
      return wrap;
    }

    async function refreshConversationsList() {
      try {
        const convResp = await window.API.Messages.getConversations();
        if (!conversationsList) return;
        conversationsList.innerHTML = '';
        if (convResp.success && convResp.users && convResp.users.length) {
          convResp.users.forEach(u => renderConversationItem(u, conversationsList));
        } else {
          conversationsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'No conversations yet') + '</p>';
        }
      } catch (e) {
        if (conversationsList) conversationsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'No conversations') + '</p>';
      }
    }

    function renderUserItem(u, container) {
      renderConversationItem(u, container);
    }

    async function loadConversation(withUserId, withUsername, fullReload) {
      if (!convContainer) return;
      if (fullReload) {
        convContainer.innerHTML = '<p class="muted">' + (I18n.t('loading') || 'Loading...') + '</p>';
        lastLoadedMessageIds.clear();
      }
      try {
        const resp = await window.API.Messages.getMessages(withUserId);
        if (!resp.success || !resp.messages) {
          if (fullReload) convContainer.innerHTML = '<p class="muted">' + (I18n.t('no_messages') || 'No messages yet') + '</p>';
          return;
        }
        const messages = resp.messages;
        if (messages.length === 0) {
          if (fullReload) convContainer.innerHTML = '<p class="muted">' + (I18n.t('no_messages') || 'No messages yet') + '</p>';
          return;
        }
        const partner = selectedUser && String(selectedUser.id) === String(withUserId) ? selectedUser : { id: withUserId, username: withUsername };
        const partnerAvatarHtml = partner.avatar
          ? `<img src="${partner.avatar.startsWith('http') ? partner.avatar : getServerOrigin() + '/api/files/' + partner.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/')}" alt="">`
          : `<span class="conv-avatar-letter">${(withUsername || '?').charAt(0).toUpperCase()}</span>`;
        const myAvatarHtml = currentUser.avatar
          ? `<img src="${currentUser.avatar.startsWith('http') ? currentUser.avatar : getServerOrigin() + '/api/files/' + currentUser.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/')}" alt="">`
          : `<span class="conv-avatar-letter">${(currentUser.username || '?').charAt(0).toUpperCase()}</span>`;

        if (fullReload) {
          convContainer.innerHTML = '';
          messages.forEach(msg => {
            const isOwn = String(msg.fromUserId) === String(currentUser.id);
            const bubble = renderBubble(msg, isOwn, isOwn ? myAvatarHtml : partnerAvatarHtml);
            convContainer.appendChild(bubble);
            lastLoadedMessageIds.add(msg.id);
          });
        } else {
          const toAppend = messages.filter(msg => !lastLoadedMessageIds.has(msg.id));
          toAppend.forEach(msg => {
            const isOwn = String(msg.fromUserId) === String(currentUser.id);
            const bubble = renderBubble(msg, isOwn, isOwn ? myAvatarHtml : partnerAvatarHtml);
            convContainer.appendChild(bubble);
            lastLoadedMessageIds.add(msg.id);
          });
        }
        convContainer.scrollTop = convContainer.scrollHeight;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg) setLastSeen(withUserId, lastMsg.id);
      } catch (error) {
        if (fullReload) convContainer.innerHTML = '<p class="error-text">' + escapeHtml(error.message) + '</p>';
      }
    }

    async function searchUsersForMessages(query) {
      if (!usersList) return;
      usersList.innerHTML = '';
      const q = query.trim();
      if (!q) return;
      try {
        const resp = await window.API.User.searchUsers(q);
        if (resp.success && resp.users) {
          resp.users.forEach(u => {
            if (String(u.id) === String(currentUser.id)) return;
            const div = document.createElement('button');
            div.type = 'button';
            div.className = 'messages-conv-item';
            div.innerHTML = `
              <span class="conv-avatar-wrap">${u.avatar ? `<img class="conv-avatar" src="${u.avatar.startsWith('http') ? u.avatar : getServerOrigin() + '/api/files/' + u.avatar.replace(/^uploads[\/\\]/, '').replace(/\\/g, '/')}" alt="">` : `<span class="conv-avatar-letter">${(u.username || '?').charAt(0).toUpperCase()}</span>`}</span>
              <div class="conv-body">
                <div class="conv-name"><span class="messages-status-dot offline"></span>${escapeHtml(u.username)}</div>
                <div class="conv-preview">${escapeHtml(u.email || '')}</div>
              </div>
            `;
            div.addEventListener('click', () => selectUserAndLoad(u, div));
            usersList.appendChild(div);
          });
        }
      } catch (error) {
        usersList.innerHTML = '<p class="error-text">' + escapeHtml(error.message) + '</p>';
      }
    }

    if (searchInput) {
      let timeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchUsersForMessages(searchInput.value), 300);
      });
    }

    (async () => {
      try {
        const convResp = await window.API.Messages.getConversations();
        if (conversationsList && convResp.success && convResp.users && convResp.users.length) {
          conversationsList.innerHTML = '';
          convResp.users.forEach(u => renderConversationItem(u, conversationsList));
        } else if (conversationsList) {
          conversationsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'No conversations yet') + '</p>';
        }
      } catch (e) {
        if (conversationsList) conversationsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'No conversations') + '</p>';
      }
      try {
        const recResp = await window.API.Recommendations.getUsers();
        const users = recResp.users || recResp.recommendations || [];
        const toShow = users.filter(u => String(u.id) !== String(currentUser.id)).slice(0, 10);
        if (recommendationsList) {
          recommendationsList.innerHTML = '';
          if (toShow.length) toShow.forEach(u => renderConversationItem(u, recommendationsList));
          else {
            const recentResp = await window.API.User.getRecentUsers();
            const recent = (recentResp.users || []).filter(u => String(u.id) !== String(currentUser.id)).slice(0, 5);
            recent.forEach(u => renderConversationItem(u, recommendationsList));
            if (recent.length === 0) recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'No users to recommend') + '</p>';
          }
        }
      } catch (e) {
        try {
          const recentResp = await window.API.User.getRecentUsers();
          const recent = (recentResp.users || []).filter(u => String(u.id) !== String(currentUser.id)).slice(0, 5);
          if (recommendationsList) {
            recommendationsList.innerHTML = '';
            if (recent.length) recent.forEach(u => renderConversationItem(u, recommendationsList));
            else recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'No users to recommend') + '</p>';
          }
        } catch (e2) {
          if (recommendationsList) recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'No recommendations') + '</p>';
        }
      }
    })();

    if (sendBtn && inputEl) {
      function sendMessage() {
        const text = inputEl.value.trim();
        if (!text || !selectedUser) return;
        window.API.Messages.sendMessage(selectedUser.id, text).then(resp => {
          if (resp.success) {
            inputEl.value = '';
            lastLoadedMessageIds.clear();
            loadConversation(selectedUser.id, selectedUser.username, true);
          }
        }).catch(err => alert('Ошибка: ' + err.message));
      }
      sendBtn.addEventListener('click', sendMessage);
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    setInterval(() => {
      if (!selectedUser) return;
      loadConversation(selectedUser.id, selectedUser.username, false);
    }, POLLING_INTERVAL_MS);
  },

  async renderMessengerPage() {
    const authOk = await this.requireAuth();
    if (!authOk) return;
    this.setupLogoutButton();
    this.setupLanguageSelector();
    if (window.I18n && I18n.apply) I18n.apply(document);
    const me = await getCurrentUser();
    if (!me) return;
    const floatingPanel = document.getElementById('messengerFloatingPanel');
    const placeholder = document.getElementById('messagesChatPlaceholder');
    const roomsList = document.getElementById('messagesRoomsList');
    const recommendationsList = document.getElementById('messagesRecommendationsList');
    const searchInput = document.getElementById('messagesSearchInput');
    const roomTitleEl = document.getElementById('messengerRoomTitle');
    const roomBadgeEl = document.getElementById('messengerRoomBadge');
    const typingEl = document.getElementById('messengerTypingIndicator');
    const autoscrollCheck = document.getElementById('messengerAutoscroll');
    const messagesContainer = document.getElementById('messengerMessages');
    const newMessageBanner = document.getElementById('messengerNewMessageBanner');
    const newMessageBtn = document.getElementById('messengerNewMessageBtn');
    const replyRefEl = document.getElementById('messengerReplyRef');
    const inputEl = document.getElementById('messengerInput');
    const emojiBtn = document.getElementById('messengerEmojiBtn');
    const emojiPicker = document.getElementById('messengerEmojiPicker');
    const anonymousCheck = document.getElementById('messengerAnonymous');
    const sendBtn = document.getElementById('messengerSendBtn');
    const createRoomBtn = document.getElementById('messengerCreateRoomBtn');
    const createRoomModal = document.getElementById('messengerCreateRoomModal');
    const createRoomTitle = document.getElementById('createRoomTitle');
    const createRoomType = document.getElementById('createRoomType');
    const createRoomAnonymous = document.getElementById('createRoomAnonymous');
    const createRoomExpires = document.getElementById('createRoomExpires');
    const createRoomPublic = document.getElementById('createRoomPublic');
    const createRoomMembersInput = document.getElementById('createRoomMembersInput');
    const createRoomSubmit = document.getElementById('messengerCreateRoomSubmit');
    const createRoomCancel = document.getElementById('messengerCreateRoomCancel');
    const messengerSearchInput = document.getElementById('messengerSearchInput');
    const messengerFilterAuthor = document.getElementById('messengerFilterAuthor');
    const messengerFilterDate = document.getElementById('messengerFilterDate');
    const messengerMinimizeBtn = document.getElementById('messengerMinimizeBtn');
    const messengerResizeHandle = document.getElementById('messengerResizeHandle');
    const messengerMutedBanner = document.getElementById('messengerMutedBanner');
    const messengerAddMembersBtn = document.getElementById('messengerAddMembersBtn');
    const messengerMembersModal = document.getElementById('messengerMembersModal');
    const messengerMembersList = document.getElementById('messengerMembersList');
    const messengerAddMemberSearch = document.getElementById('messengerAddMemberSearch');
    const messengerAddMemberBtn = document.getElementById('messengerAddMemberBtn');
    const messengerMembersModalClose = document.getElementById('messengerMembersModalClose');
    const messengerMuteModal = document.getElementById('messengerMuteModal');
    const messengerMuteTargetName = document.getElementById('messengerMuteTargetName');
    const messengerMuteMinutes = document.getElementById('messengerMuteMinutes');
    const messengerMuteConfirm = document.getElementById('messengerMuteConfirm');
    const messengerMuteCancel = document.getElementById('messengerMuteCancel');
    const messengerHelpBtn = document.getElementById('messengerHelpBtn');
    const messengerHelpPopup = document.getElementById('messengerHelpPopup');
    let currentRoom = null;
    let lastMessageId = 0;
    let replyToMessageId = null;
    let pollTimer = null;
    let allMessages = [];
    let isMuted = false;
    let mutedUntil = null;
    let amIAdmin = false;
    const POLL_MS = 2500;
    const TYPING_DECAY_MS = 2000;
    const EMOJI_LIST = ['😀','😁','😂','😊','👍','❤️','🔥','👀','😢','😮','🎉','✨'];
    function formatMessageTime(iso) {
      try {
        const d = new Date(iso);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    }
    function getAvatarHtml(userOrMsg, isAnonymous, anonymousColor) {
      if (isAnonymous && anonymousColor) return `<span style="background:${anonymousColor};color:#fff;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;">?</span>`;
      const avatar = userOrMsg.avatar || userOrMsg.fromAvatar;
      if (avatar) return `<img src="${getFileUrl(avatar)}" alt="">`;
      const name = (userOrMsg.username || userOrMsg.fromUsername || '?').toString();
      return `<span class="conv-avatar-letter">${name.charAt(0).toUpperCase()}</span>`;
    }
    function clearReplyRef() {
      replyToMessageId = null;
      if (replyRefEl) { replyRefEl.classList.add('hidden'); replyRefEl.innerHTML = ''; }
    }
    function isAtBottom(el) {
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }
    function scrollToBottom(force) {
      if (!messagesContainer) return;
      if (force || (autoscrollCheck && autoscrollCheck.checked)) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (newMessageBanner) newMessageBanner.classList.add('hidden');
      }
    }
    function renderMessage(msg, room, searchQuery) {
      const isOwn = String(msg.fromUserId) === String(me.id);
      const displayName = msg.isAnonymous ? (I18n.t('anonymous') || 'Anonymous') : (msg.fromUsername || '?');
      const avatarHtml = getAvatarHtml(msg, msg.isAnonymous, msg.anonymousColor);
      const replyHtml = msg.replyTo ? `<div class="messenger-msg-reply-to">${escapeHtml((msg.replyTo.content || '').slice(0, 50))}${(msg.replyTo.content || '').length > 50 ? '…' : ''}</div>` : '';
      let textHtml = escapeHtml(msg.content || '');
      if (searchQuery) {
        const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(${q})`, 'gi');
        textHtml = textHtml.replace(re, '<span class="mark-highlight">$1</span>');
      }
      const reactionEmojis = ['❤️','🔥','😂','😮'];
      const reactionCounts = {};
      (msg.reactions || []).forEach(r => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1; });
      const reactionRow = reactionEmojis.map(emoji => {
        const count = reactionCounts[emoji] || 0;
        const isActive = (msg.reactions || []).some(r => r.emoji === emoji && String(r.userId) === String(me.id));
        return `<button type="button" class="messenger-reaction-btn ${isActive ? 'reaction-active' : ''}" data-emoji="${emoji}" data-message-id="${msg.id}">${emoji} ${count > 0 ? count : ''}</button>`;
      }).join('');
      const div = document.createElement('div');
      div.className = 'messenger-msg' + (isOwn ? ' own' : '') + (replyToMessageId === msg.id ? ' highlight' : '');
      div.dataset.messageId = msg.id;
      div.innerHTML = `
        <span class="messenger-msg-avatar">${avatarHtml}</span>
        <div class="messenger-msg-bubble">
          <div class="messenger-msg-meta" style="font-size:0.75rem;opacity:0.9;margin-bottom:2px;">${escapeHtml(displayName)}</div>
          ${replyHtml}
          <div class="messenger-msg-text">${textHtml}</div>
          <div class="messenger-msg-time">${formatMessageTime(msg.createdAt)}</div>
          <div class="messenger-msg-reactions">${reactionRow}</div>
          <div class="messenger-msg-actions"><button type="button" class="messenger-msg-reply-btn" data-message-id="${msg.id}">${I18n.t('comment_reply') || 'Ответить'}</button></div>
        </div>
      `;
      div.querySelectorAll('.messenger-reaction-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const mid = parseInt(btn.dataset.messageId, 10);
          const emojiKey = btn.dataset.emoji;
          btn.classList.add('reaction-pop');
          setTimeout(() => btn.classList.remove('reaction-pop'), 400);
          try {
            const resp = await window.API.Rooms.toggleMessageReaction(currentRoom.id, mid, emojiKey);
            if (resp.success && resp.reactions) {
              const counts = {};
              resp.reactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
              div.querySelectorAll('.messenger-reaction-btn').forEach(b => {
                const e = b.dataset.emoji;
                const c = counts[e] || 0;
                b.innerHTML = e + (c > 0 ? ' ' + c : '');
                b.classList.toggle('reaction-active', resp.reactions.some(r => r.emoji === e && String(r.userId) === String(me.id)));
              });
            }
          } catch (e) { console.error(e); }
        });
      });
      div.querySelector('.messenger-msg-reply-btn').addEventListener('click', () => {
        replyToMessageId = msg.id;
        replyRefEl.innerHTML = `${I18n.t('comment_reply') || 'Ответ'} #${msg.id} <span class="messenger-reply-clear">${I18n.t('cancel') || 'Отмена'}</span>`;
        replyRefEl.classList.remove('hidden');
        replyRefEl.querySelector('.messenger-reply-clear').onclick = clearReplyRef;
        inputEl.value = `>>#${msg.id} ` + (inputEl.value || '').trimStart();
        inputEl.focus();
        messagesContainer.querySelectorAll('.messenger-msg.highlight').forEach(el => el.classList.remove('highlight'));
        div.classList.add('highlight');
        setTimeout(() => div.classList.remove('highlight'), 1200);
        scrollToBottom(true);
      });
      return div;
    }
    function getSearchQuery() { return (messengerSearchInput && messengerSearchInput.value || '').trim().toLowerCase(); }
    function getAuthorFilter() { return messengerFilterAuthor ? messengerFilterAuthor.value : ''; }
    function getDateFilter() { return messengerFilterDate ? messengerFilterDate.value : ''; }
    function msgMatchesFilters(msg) {
      const q = getSearchQuery();
      if (q) {
        const content = (msg.content || '').toLowerCase();
        const author = (msg.fromUsername || '').toLowerCase();
        if (!content.includes(q) && !author.includes(q)) return false;
      }
      const authorId = getAuthorFilter();
      if (authorId && String(msg.fromUserId) !== authorId) return false;
      const dateFilter = getDateFilter();
      if (dateFilter) {
        const msgDate = (msg.createdAt || '').slice(0, 10);
        if (msgDate !== dateFilter) return false;
      }
      return true;
    }
    function applyFilters() {
      if (!messagesContainer) return;
      const q = getSearchQuery();
      const filtered = allMessages.filter(m => msgMatchesFilters(m));
      messagesContainer.innerHTML = '';
      filtered.forEach(msg => messagesContainer.appendChild(renderMessage(msg, currentRoom, q)));
    }
    async function loadRoomMessages(appendNewOnly) {
      if (!currentRoom || !messagesContainer) return;
      try {
        const opts = appendNewOnly && lastMessageId ? { afterId: lastMessageId, limit: 50 } : { limit: 50, offset: 0 };
        const resp = await window.API.Rooms.getRoomMessages(currentRoom.id, opts);
        if (!resp.success || !resp.messages) return;
        const list = resp.messages;
        if (list.length === 0 && !appendNewOnly) {
          allMessages = [];
          messagesContainer.innerHTML = '<p class="muted">' + (I18n.t('no_messages') || 'Нет сообщений') + '</p>';
          return;
        }
        if (appendNewOnly) {
          list.forEach(msg => {
            if (msg.id > lastMessageId) {
              lastMessageId = Math.max(lastMessageId, msg.id);
              allMessages.push(msg);
              if (msgMatchesFilters(msg)) {
                const node = renderMessage(msg, currentRoom, getSearchQuery());
                messagesContainer.appendChild(node);
              }
              if (autoscrollCheck && autoscrollCheck.checked) scrollToBottom(true);
              else if (!isAtBottom(messagesContainer) && floatingPanel && floatingPanel.classList.contains('visible')) {
                newMessageBanner.classList.remove('hidden');
                floatingPanel.classList.add('new-message-notify');
                setTimeout(() => floatingPanel.classList.remove('new-message-notify'), 500);
              }
            }
          });
        } else {
          allMessages = list;
          const authorOpts = {};
          list.forEach(m => {
            const id = m.fromUserId;
            const name = m.isAnonymous ? (I18n.t('anonymous') || '?') : (m.fromUsername || '?');
            if (!authorOpts[id]) authorOpts[id] = name;
          });
          if (messengerFilterAuthor) {
            const cur = messengerFilterAuthor.value;
            messengerFilterAuthor.innerHTML = '<option value="">' + (I18n.t('messenger_filter_all') || 'Все') + '</option>' +
              Object.entries(authorOpts).map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
            messengerFilterAuthor.value = cur || '';
          }
          applyFilters();
          scrollToBottom(true);
        }
      } catch (e) { console.error(e); }
    }
    async function pollRoom() {
      if (!currentRoom) return;
      await loadRoomMessages(true);
      try {
        const t = await window.API.Rooms.getTyping(currentRoom.id);
        if (t.success && t.typingUserIds && t.typingUserIds.length) {
          typingEl.textContent = (I18n.t('messenger_typing') || 'печатает...');
          typingEl.classList.remove('hidden');
        } else typingEl.classList.add('hidden');
      } catch (_) { typingEl.classList.add('hidden'); }
    }
    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(pollRoom, POLL_MS);
    }
    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
    async function sendMessage() {
      const text = (inputEl && inputEl.value || '').trim();
      if (!text || !currentRoom) return;
      const anonymous = anonymousCheck ? anonymousCheck.checked : false;
      let content = text;
      if (replyToMessageId && content.startsWith('>>#')) {
        const match = content.match(/^>>#\d+\s*/);
        if (match) content = content.slice(match[0].length).trim();
      }
      if (!content) return;
      try {
        const resp = await window.API.Rooms.sendRoomMessage(currentRoom.id, content, { anonymous, replyToId: replyToMessageId });
        if (!resp.success && resp.mutedUntil) {
          isMuted = true;
          mutedUntil = resp.mutedUntil;
          if (messengerMutedBanner) {
            try {
              const untilStr = new Date(resp.mutedUntil).toLocaleString();
              messengerMutedBanner.textContent = (I18n.t('messenger_muted_until') || 'Вы замучены до') + ' ' + untilStr;
              messengerMutedBanner.classList.remove('hidden');
            } catch (_) {}
          }
          if (inputEl) inputEl.disabled = true;
          return;
        }
        if (resp.success && resp.message) {
          inputEl.value = '';
          clearReplyRef();
          allMessages.push(resp.message);
          lastMessageId = Math.max(lastMessageId, resp.message.id);
          if (msgMatchesFilters(resp.message)) {
            messagesContainer.appendChild(renderMessage(resp.message, currentRoom, getSearchQuery()));
          }
          scrollToBottom(true);
        }
      } catch (e) { alert((I18n.t('error_save_comment') || 'Ошибка') + ': ' + e.message); }
    }
    async function openRoom(room) {
      currentRoom = room;
      document.body.classList.add('messenger-panel-open');
      if (placeholder) placeholder.style.display = 'none';
      if (floatingPanel) { floatingPanel.classList.add('visible'); floatingPanel.setAttribute('aria-hidden', 'false'); }
      if (roomTitleEl) roomTitleEl.textContent = room.title || (I18n.t('messenger_dm') || 'Личный чат');
      if (roomBadgeEl) {
        roomBadgeEl.classList.remove('hidden');
        if ((room.messageCount || 0) >= 15) roomBadgeEl.textContent = '🔥 Hot';
        else roomBadgeEl.textContent = room.type === 'dm' ? '' : (room.memberCount || 0) + '';
        if (!roomBadgeEl.textContent) roomBadgeEl.classList.add('hidden');
      }
      isMuted = false;
      mutedUntil = null;
      amIAdmin = false;
      if (messengerMutedBanner) { messengerMutedBanner.classList.add('hidden'); }
      if (inputEl) inputEl.disabled = false;
      if (messengerAddMembersBtn) messengerAddMembersBtn.style.display = room.type === 'group' ? '' : 'none';
      try {
        const [muteResp, membersResp] = await Promise.all([
          window.API.Rooms.getMuteStatus(room.id),
          window.API.Rooms.getRoomMembers(room.id)
        ]);
        if (muteResp && muteResp.muted && muteResp.mutedUntil) {
          isMuted = true;
          mutedUntil = muteResp.mutedUntil;
          if (messengerMutedBanner) {
            try {
              messengerMutedBanner.textContent = (I18n.t('messenger_muted_until') || 'Вы замучены до') + ' ' + new Date(muteResp.mutedUntil).toLocaleString();
              messengerMutedBanner.classList.remove('hidden');
            } catch (_) {}
          }
          if (inputEl) inputEl.disabled = true;
        }
        const meMember = (membersResp.members || []).find(m => String(m.userId) === String(me.id));
        amIAdmin = meMember && meMember.isAdmin;
        if (messengerAddMembersBtn) messengerAddMembersBtn.style.display = (room.type === 'group' && amIAdmin) ? '' : 'none';
      } catch (_) {}
      lastMessageId = 0;
      if (messengerSearchInput) messengerSearchInput.value = '';
      if (messengerFilterAuthor) messengerFilterAuthor.value = '';
      if (messengerFilterDate) messengerFilterDate.value = '';
      loadRoomMessages(false);
      startPolling();
      if (typingEl) typingEl.classList.add('hidden');
      if (newMessageBanner) newMessageBanner.classList.add('hidden');
      roomsList && roomsList.querySelectorAll('.messages-conv-item').forEach(el => el.classList.remove('selected'));
      const sel = roomsList && roomsList.querySelector(`[data-room-id="${room.id}"]`);
      if (sel) sel.classList.add('selected');
      runFirstTimeTour();
    }
    function closeRoom() {
      stopPolling();
      currentRoom = null;
      document.body.classList.remove('messenger-panel-open', 'messenger-panel-collapsed');
      if (floatingPanel) { floatingPanel.classList.remove('visible', 'collapsed'); floatingPanel.setAttribute('aria-hidden', 'true'); }
      if (messengerMinimizeBtn) messengerMinimizeBtn.textContent = '−';
      if (placeholder) placeholder.style.display = 'flex';
      roomsList && roomsList.querySelectorAll('.messages-conv-item').forEach(el => el.classList.remove('selected'));
    }
    function renderRoomItem(room) {
      const div = document.createElement('button');
      div.type = 'button';
      div.className = 'messages-conv-item' + (currentRoom && currentRoom.id === room.id ? ' selected' : '') + ((room.messageCount || 0) >= 15 ? ' messenger-room-item hot' : '');
      div.dataset.roomId = room.id;
      const title = room.title || (I18n.t('messenger_dm') || 'Личный чат');
      const preview = (room.lastMessageContent || '').slice(0, 35);
      const timeStr = room.lastMessageAt ? formatMessageTime(room.lastMessageAt) : '';
      div.innerHTML = `
        <span class="conv-avatar-wrap"><span class="conv-avatar-letter">${(title || '?').charAt(0).toUpperCase()}</span></span>
        <div class="conv-body">
          <div class="conv-meta"><span class="conv-name">${escapeHtml(title)}</span>${timeStr ? `<span class="conv-time">${timeStr}</span>` : ''}</div>
          <div class="conv-preview">${escapeHtml(preview) || (I18n.t('no_messages') || 'Нет сообщений')}</div>
        </div>
      `;
      div.addEventListener('click', () => openRoom(room));
      return div;
    }
    async function refreshRooms() {
      try {
        const resp = await window.API.Rooms.getRooms();
        if (!roomsList) return;
        roomsList.innerHTML = '';
        if (resp.success && resp.rooms && resp.rooms.length) resp.rooms.forEach(room => roomsList.appendChild(renderRoomItem(room)));
        else roomsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'Нет чатов') + '</p>';
      } catch (e) { if (roomsList) roomsList.innerHTML = '<p class="muted">' + (I18n.t('no_conversations') || 'Нет чатов') + '</p>'; }
    }
    if (emojiPicker) EMOJI_LIST.forEach(emoji => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = emoji;
      btn.addEventListener('click', () => {
        const start = inputEl.selectionStart, end = inputEl.selectionEnd, v = inputEl.value;
        inputEl.value = v.slice(0, start) + emoji + v.slice(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + emoji.length;
        inputEl.focus();
      });
      emojiPicker.appendChild(btn);
    });
    if (emojiBtn && emojiPicker) emojiBtn.addEventListener('click', () => emojiPicker.classList.toggle('hidden'));
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (inputEl) {
      inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
      let typingTimeout;
      inputEl.addEventListener('input', () => {
        if (!currentRoom) return;
        window.API.Rooms.setTyping(currentRoom.id, true).catch(() => {});
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => window.API.Rooms.setTyping(currentRoom.id, false).catch(() => {}), TYPING_DECAY_MS);
      });
    }
    if (newMessageBtn) newMessageBtn.addEventListener('click', () => scrollToBottom(true));
    const messengerFab = document.getElementById('messengerFab');
    if (messengerFab && floatingPanel) {
      messengerFab.addEventListener('click', () => {
        if (currentRoom) {
          floatingPanel.classList.remove('collapsed');
          if (messengerMinimizeBtn) messengerMinimizeBtn.textContent = '−';
          floatingPanel.classList.add('visible');
          document.body.classList.add('messenger-panel-open');
          if (placeholder) placeholder.style.display = 'none';
        }
      });
      if (window.I18n) {
        const fabLabel = I18n.t('messenger_fab_label') || (I18n.t('nav_messages') || 'Messages');
        messengerFab.setAttribute('aria-label', fabLabel);
        messengerFab.setAttribute('title', fabLabel);
      }
    }
    const closeBtn = document.getElementById('messengerCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => closeRoom());
    if (messengerHelpBtn && window.I18n) {
      const helpTitle = I18n.t('messenger_help_title') || 'Help';
      messengerHelpBtn.setAttribute('title', helpTitle);
      messengerHelpBtn.setAttribute('aria-label', helpTitle);
    }
    if (messengerSearchInput) messengerSearchInput.addEventListener('input', () => applyFilters());
    if (messengerFilterAuthor) messengerFilterAuthor.addEventListener('change', () => applyFilters());
    if (messengerFilterDate) messengerFilterDate.addEventListener('change', () => applyFilters());
    if (messengerMinimizeBtn && floatingPanel) {
      messengerMinimizeBtn.addEventListener('click', () => {
        const collapsed = floatingPanel.classList.toggle('collapsed');
        document.body.classList.toggle('messenger-panel-collapsed', collapsed);
        messengerMinimizeBtn.textContent = collapsed ? '+' : '−';
        const title = collapsed
          ? (I18n.t('messenger_expand') || 'Развернуть')
          : (I18n.t('messenger_minimize') || 'Свернуть');
        messengerMinimizeBtn.setAttribute('title', title);
        messengerMinimizeBtn.setAttribute('aria-label', title);
      });
    }
    if (messengerResizeHandle && floatingPanel) {
      let resizeStartX = 0, resizeStartW = 0;
      messengerResizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizeStartX = e.clientX;
        resizeStartW = floatingPanel.offsetWidth;
        const onMove = (ev) => {
          const delta = resizeStartX - ev.clientX;
          let w = Math.max(280, Math.min(window.innerWidth * 0.9, resizeStartW + delta));
          floatingPanel.style.width = w + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      if (window.I18n) {
        const resizeTitle = I18n.t('messenger_resize') || 'Изменить размер';
        messengerResizeHandle.setAttribute('title', resizeTitle);
      }
    }
    function runFirstTimeTour() {
      const key = 'messenger_tour_done';
      if (localStorage.getItem(key)) return;
      if (!messengerHelpPopup) return;
      localStorage.setItem(key, '1');
      setTimeout(() => { if (messengerHelpPopup) messengerHelpPopup.classList.remove('hidden'); }, 800);
      setTimeout(() => { if (messengerHelpPopup) messengerHelpPopup.classList.add('hidden'); }, 6000);
    }
    if (messengerHelpBtn && messengerHelpPopup) {
      messengerHelpBtn.addEventListener('click', () => messengerHelpPopup.classList.toggle('hidden'));
    }
    document.addEventListener('click', (e) => {
      if (messengerHelpPopup && !messengerHelpPopup.classList.contains('hidden') && !messengerHelpPopup.contains(e.target) && !messengerHelpBtn.contains(e.target)) {
        messengerHelpPopup.classList.add('hidden');
      }
    });
    let muteTargetUserId = null;
    async function loadMembersModal() {
      if (!currentRoom || !messengerMembersList) return;
      try {
        const resp = await window.API.Rooms.getRoomMembers(currentRoom.id);
        const members = resp.members || [];
        messengerMembersList.innerHTML = '';
        members.forEach(m => {
          const row = document.createElement('div');
          row.className = 'messenger-member-row';
          row.dataset.userId = m.userId;
          const name = m.username || ('#' + m.userId);
          const avatarHtml = m.avatar ? `<img src="${getFileUrl(m.avatar)}" alt="">` : `<span>${(name || '?').charAt(0).toUpperCase()}</span>`;
          const isMe = String(m.userId) === String(me.id);
          const actionsHtml = amIAdmin && !isMe ? `
            <div class="messenger-member-actions">
              <button type="button" class="btn ghost small messenger-mute-member-btn" data-user-id="${m.userId}" data-username="${escapeHtml(name)}" title="${I18n.t('messenger_mute_user') || 'Замутить'}">🔇</button>
              <button type="button" class="btn ghost small messenger-remove-member-btn" data-user-id="${m.userId}" data-username="${escapeHtml(name)}" title="${I18n.t('messenger_remove') || 'Удалить'}">✕</button>
            </div>
          ` : '';
          row.innerHTML = `
            <div class="messenger-member-info">
              <span class="avatar">${avatarHtml}</span>
              <span>${escapeHtml(name)}${m.isAdmin ? ' ★' : ''}${isMe ? ' (' + (I18n.t('you') || 'вы') + ')' : ''}</span>
            </div>
            ${actionsHtml}
          `;
          const muteBtn = row.querySelector('.messenger-mute-member-btn');
          const removeBtn = row.querySelector('.messenger-remove-member-btn');
          if (muteBtn) muteBtn.addEventListener('click', () => {
            muteTargetUserId = m.userId;
            if (messengerMuteTargetName) messengerMuteTargetName.textContent = name;
            if (messengerMuteModal) messengerMuteModal.classList.remove('hidden');
          });
          if (removeBtn) removeBtn.addEventListener('click', async () => {
            if (!confirm((I18n.t('messenger_remove_confirm') || 'Удалить') + ' ' + name + '?')) return;
            try {
              await window.API.Rooms.removeRoomMember(currentRoom.id, m.userId);
              row.remove();
              await refreshRooms();
            } catch (err) { alert((I18n.t('error') || 'Ошибка') + ': ' + err.message); }
          });
          messengerMembersList.appendChild(row);
        });
      } catch (e) { if (messengerMembersList) messengerMembersList.innerHTML = '<p class="muted">' + (e.message || 'Ошибка') + '</p>'; }
    }
    if (messengerAddMembersBtn && messengerMembersModal) {
      messengerAddMembersBtn.addEventListener('click', () => {
        if (!currentRoom) return;
        messengerMembersModal.classList.remove('hidden');
        loadMembersModal();
      });
    }
    if (messengerMembersModal) {
      messengerMembersModal.querySelector('.messenger-modal-backdrop')?.addEventListener('click', () => messengerMembersModal.classList.add('hidden'));
      messengerMembersModalClose?.addEventListener('click', () => messengerMembersModal.classList.add('hidden'));
    }
    if (messengerAddMemberSearch && messengerAddMemberBtn) {
      messengerAddMemberBtn.addEventListener('click', async () => {
        const q = (messengerAddMemberSearch.value || '').trim();
        if (!q || !currentRoom) return;
        try {
          const resp = await window.API.User.searchUsers(q);
          const users = (resp.users || []).filter(u => String(u.id) !== String(me.id));
          if (users.length === 0) { alert(I18n.t('no_users_found') || 'Никого не найдено'); return; }
          const ids = users.slice(0, 10).map(u => u.id);
          await window.API.Rooms.addRoomMembers(currentRoom.id, ids);
          messengerAddMemberSearch.value = '';
          await loadMembersModal();
          await refreshRooms();
        } catch (err) { alert((I18n.t('error') || 'Ошибка') + ': ' + err.message); }
      });
    }
    if (messengerMuteModal) {
      messengerMuteModal.querySelector('.messenger-modal-backdrop')?.addEventListener('click', () => { messengerMuteModal.classList.add('hidden'); muteTargetUserId = null; });
      messengerMuteCancel?.addEventListener('click', () => { messengerMuteModal.classList.add('hidden'); muteTargetUserId = null; });
    }
    if (messengerMuteConfirm && messengerMuteMinutes) {
      messengerMuteConfirm.addEventListener('click', async () => {
        if (!currentRoom || !muteTargetUserId) return;
        const minutes = parseInt(messengerMuteMinutes.value || '60', 10);
        try {
          await window.API.Rooms.muteUser(currentRoom.id, muteTargetUserId, minutes);
          messengerMuteModal.classList.add('hidden');
          muteTargetUserId = null;
        } catch (err) { alert((I18n.t('error') || 'Ошибка') + ': ' + err.message); }
      });
    }
    if (createRoomBtn && createRoomModal) {
      createRoomBtn.addEventListener('click', () => {
        createRoomModal.classList.remove('hidden');
        if (createRoomTitle) createRoomTitle.value = '';
        if (createRoomType) createRoomType.value = 'group';
        if (createRoomAnonymous) createRoomAnonymous.checked = false;
        if (createRoomExpires) createRoomExpires.value = '';
        if (createRoomPublic) createRoomPublic.checked = true;
        if (createRoomMembersInput) createRoomMembersInput.value = '';
      });
    }
    if (createRoomModal) {
      createRoomModal.querySelector('.messenger-modal-backdrop').addEventListener('click', () => createRoomModal.classList.add('hidden'));
      if (createRoomCancel) createRoomCancel.addEventListener('click', () => createRoomModal.classList.add('hidden'));
    }
    if (createRoomSubmit) {
      createRoomSubmit.addEventListener('click', async () => {
        const title = (createRoomTitle && createRoomTitle.value || '').trim() || null;
        const type = (createRoomType && createRoomType.value) || 'group';
        const isAnonymous = createRoomAnonymous && createRoomAnonymous.checked;
        const expiresVal = createRoomExpires && createRoomExpires.value;
        const expiresInDays = expiresVal ? parseInt(expiresVal, 10) : null;
        const isPublic = createRoomPublic && createRoomPublic.checked;
        const membersStr = createRoomMembersInput && createRoomMembersInput.value || '';
        let memberIds = [];
        if (membersStr.trim()) membersStr.split(/[\s,]+/).filter(Boolean).forEach(p => { const id = parseInt(p, 10); if (!isNaN(id)) memberIds.push(id); });
        try {
          const resp = await window.API.Rooms.createRoom({ title, type, isAnonymous, expiresInDays, isPublic, memberIds });
          if (resp.success && resp.room) { createRoomModal.classList.add('hidden'); await refreshRooms(); openRoom(resp.room); }
        } catch (e) { alert('Ошибка: ' + e.message); }
      });
    }
    async function loadRecommendations() {
      try {
        const recResp = await window.API.Recommendations.getUsers();
        let toShow = (recResp.users || recResp.recommendations || []).filter(u => String(u.id) !== String(me.id)).slice(0, 10);
        if (toShow.length === 0) {
          const recentResp = await window.API.User.getRecentUsers();
          toShow = (recentResp.users || []).filter(u => String(u.id) !== String(me.id)).slice(0, 5);
        }
        if (!recommendationsList) return;
        recommendationsList.innerHTML = '';
        if (toShow.length === 0) { recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'Нет рекомендаций') + '</p>'; return; }
        toShow.forEach(u => {
          const div = document.createElement('button');
          div.type = 'button';
          div.className = 'messages-conv-item';
          div.innerHTML = `<span class="conv-avatar-wrap">${u.avatar ? `<img class="conv-avatar" src="${getFileUrl(u.avatar)}" alt="">` : `<span class="conv-avatar-letter">${(u.username || '?').charAt(0).toUpperCase()}</span>`}</span><div class="conv-body"><div class="conv-name">${escapeHtml(u.username)}</div><div class="conv-preview">${I18n.t('messenger_start_dm') || 'Написать'}</div></div>`;
          div.addEventListener('click', async () => {
            try {
              const resp = await window.API.Rooms.createRoom({ type: 'dm', memberIds: [u.id] });
              if (resp.success && resp.room) { await refreshRooms(); openRoom(resp.room); }
            } catch (err) { alert('Ошибка: ' + err.message); }
          });
          recommendationsList.appendChild(div);
        });
      } catch (e) { if (recommendationsList) recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'Нет рекомендаций') + '</p>'; }
    }
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchInput.value.trim();
        if (!q) { loadRecommendations(); return; }
        searchTimeout = setTimeout(async () => {
          try {
            const resp = await window.API.User.searchUsers(q);
            const users = (resp.users || []).filter(u => String(u.id) !== String(me.id)).slice(0, 8);
            if (!recommendationsList) return;
            recommendationsList.innerHTML = '';
            users.forEach(u => {
              const div = document.createElement('button');
              div.type = 'button';
              div.className = 'messages-conv-item';
              div.innerHTML = `<span class="conv-avatar-wrap">${u.avatar ? `<img class="conv-avatar" src="${getFileUrl(u.avatar)}" alt="">` : `<span class="conv-avatar-letter">${(u.username || '?').charAt(0).toUpperCase()}</span>`}</span><div class="conv-body"><div class="conv-name">${escapeHtml(u.username)}</div><div class="conv-preview">${escapeHtml(u.email || '')}</div></div>`;
              div.addEventListener('click', async () => {
                try {
                  const r = await window.API.Rooms.createRoom({ type: 'dm', memberIds: [u.id] });
                  if (r.success && r.room) { await refreshRooms(); openRoom(r.room); }
                } catch (err) { alert('Ошибка: ' + err.message); }
              });
              recommendationsList.appendChild(div);
            });
            if (users.length === 0) recommendationsList.innerHTML = '<p class="muted">' + (I18n.t('no_recommendations_msg') || 'Никого не найдено') + '</p>';
          } catch (_) {}
        }, 300);
      });
    }
    await refreshRooms();
    await loadRecommendations();
  },

  refreshCurrentPage: null
};

function setupMobileNav() {
  const hamburger = document.getElementById('navHamburger');
  const overlay = document.getElementById('navOverlay');
  if (!hamburger || !overlay) return;
  function open() {
    hamburger.setAttribute('aria-expanded', 'true');
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }
  function close() {
    hamburger.setAttribute('aria-expanded', 'false');
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
  hamburger.addEventListener('click', () => {
    if (overlay.classList.contains('visible')) close();
    else open();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', close);
  });
  const langMobile = document.getElementById('languageSelectMobile');
  const langMain = document.getElementById('languageSelect');
  if (langMobile && langMain) {
    langMobile.value = langMain.value;
    langMobile.addEventListener('change', () => {
      langMain.value = langMobile.value;
      if (window.I18n && I18n.setLanguage) I18n.setLanguage(langMobile.value);
      if (I18n.apply) I18n.apply(document);
    });
  }
  const themeMobile = document.getElementById('themeToggleMobile');
  const themeMain = document.getElementById('themeToggle');
  if (themeMobile && themeMain) {
    themeMobile.addEventListener('click', () => { themeMain.click(); });
  }
  const logoutMobile = document.getElementById('logoutBtnMobile');
  const logoutMain = document.getElementById('logoutBtn');
  if (logoutMobile && logoutMain) {
    logoutMobile.addEventListener('click', () => { logoutMain.click(); });
  }
}

window.App = App;
document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const t = getTheme() === 'dark' ? 'light' : 'dark';
      setTheme(t);
      applyTheme(t);
    });
    applyTheme(getTheme());
  }
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if (loginForm || registerForm) {
    App.setupAuthPage();
  }
});
