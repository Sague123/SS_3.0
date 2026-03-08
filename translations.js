// Простая система переводов интерфейса.
// Все тексты берутся из этого объекта по ключу data-i18n.

const LANGUAGE_KEY = 'language';

const TRANSLATIONS = {
  cs: {
    app_title: 'Tell ur story',
    subtitle: 'Lokální sociální síť (SQL databáze se šifrováním)',
    login_tab: 'Přihlášení',
    register_tab: 'Registrace',
    login_identifier_label: 'Uživatelské jméno nebo email',
    login_password_label: 'Heslo',
    login_button: 'Přihlásit se',
    register_username_label: 'Uživatelské jméno',
    register_email_label: 'Email',
    register_password_label: 'Heslo',
    register_button: 'Registrovat se',
    footer_index: 'Projekt pro maturitní práci — data na serveru v SQL databázi se šifrováním.',

    feed_title: 'Tell ur story',
    feed_subtitle: 'Příspěvky',
    nav_feed: 'Příspěvky',
    nav_messages: 'Zprávy',
    nav_profile: 'Profil',
    nav_my_profile: 'Můj profil',
    nav_logout: 'Odhlásit se',
    create_post_title: 'Vytvořit příspěvek',
    create_post_placeholder: 'Co je nového?',
    create_post_button: 'Publikovat',
    attach_file_label: 'Přiložit soubor',
    feed_header: 'Příspěvky',
    search_users_title: 'Vyhledávání uživatelů',
    search_placeholder: 'Zadejte uživatelské jméno',
    recommendations_title: 'Doporučení',
    rec_settings_title: 'Nastavení doporučení',
    rec_reset: 'Resetovat nastavení',
    feed_footer: 'Všechna data této stránky jsou uložena na serveru v SQL databázi se šifrováním.',

    profile_subtitle: 'Profil uživatele',
    edit_bio_title: 'Upravit bio',
    edit_bio_button: 'Uložit',
    bio_placeholder: 'Napište něco o sobě…',
    avatar_upload_label: 'Foto profilu',
    avatar_upload_button: 'Nahrát foto',
    posts_label: 'Příspěvků',
    followers_label: 'Sledující',
    following_label: 'Sledování',
    story_score_label: 'Story Score',
    post_mood_label: 'Nálada',
    my_posts_title: 'Moje příspěvky',
    profile_footer: 'Profil a statistiky jsou načítány ze SQL databáze se šifrováním.',

    user_subtitle: 'Profil uživatele',
    user_posts_title: 'Příspěvky uživatele',
    user_footer: 'Zobrazení jiného uživatele, data ze SQL databáze se šifrováním.',

    relations_title_followers: 'Sledující',
    relations_title_following: 'Sledování',
    relations_footer: 'Seznam je uložen v SQL databázi se šifrováním.',

    error_fill_all: 'Vyplňte všechna pole.',
    error_username_exists: 'Toto uživatelské jméno již existuje.',
    error_email_exists: 'Tento email je již zaregistrován.',
    error_password_short: 'Heslo musí mít alespoň 8 znaků.',
    error_login_fields: 'Zadejte přihlašovací jméno a heslo.',
    error_user_not_found: 'Uživatel nenalezen.',
    error_wrong_password: 'Nesprávné heslo.',

    no_recommendations: 'Zatím žádná doporučení.',
    bio_empty: 'Bio zatím není vyplněno.',

    feed_network_stats: 'Statistiky sítě',
    stat_users: 'Uživatelé',
    stat_posts: 'Příspěvky',
    stat_comments: 'Komentáře',
    feed_last_users: 'Poslední registrovaní uživatelé',

    messages_title: 'Zprávy',
    messages_recent: 'Nedávné konverzace',
    messages_recommendations: 'Doporučení — napište',
    messages_search_placeholder: 'Hledat uživatele...',
    messages_dialog: 'Dialog',
    messages_choose_user: 'Vyberte uživatele vlevo',
    messages_placeholder: 'Napsat zprávu...',
    messages_send: 'Odeslat',
    messages_footer: 'Zprávy jsou uloženy na serveru v SQL databázi se šifrováním.',
    no_conversations: 'Zatím žádné konverzace.',
    no_recommendations_msg: 'Žádná doporučení.',
    no_users_yet: 'Zatím žádní uživatelé.',

    crop_title: 'Oříznout obrázek',
    crop_cancel: 'Zrušit',
    crop_confirm: 'Oříznout',
    crop_size: 'Velikost',

    like: 'Lajk',
    unlike: 'Odebrat lajk',
    delete_post: 'Smazat',
    likes_word: 'lajků',
    comment: 'Komentovat',
    comments_word: 'komentářů',
    comment_placeholder: 'Napište komentář...',
    submit_comment: 'Odeslat',
    repost: 'Sdílet',
    reposts_word: 'sdílení',
    reposted: 'Sdíleno',

    follow: 'Sledovat',
    unfollow: 'Přestat sledovat',
    followers_word: 'sledujících',

    attachment_label: 'Příloha',
    attachment_download: 'Stáhnout soubor',

    lang_cs: 'Čeština',
    lang_ru: 'Русский',
    lang_en: 'English'
  },
  ru: {
    app_title: 'Tell ur story',
    subtitle: 'Локальная социальная сеть (SQL база с шифрованием)',
    login_tab: 'Вход',
    register_tab: 'Регистрация',
    login_identifier_label: 'Username или Email',
    login_password_label: 'Пароль',
    login_button: 'Войти',
    register_username_label: 'Username',
    register_email_label: 'Email',
    register_password_label: 'Пароль',
    register_button: 'Зарегистрироваться',
    footer_index: 'Проект для матуритной работы — данные на сервере в SQL базе с шифрованием.',

    feed_title: 'Tell ur story',
    feed_subtitle: 'Лента постов',
    nav_feed: 'Лента',
    nav_profile: 'Профиль',
    nav_my_profile: 'Мой профиль',
    nav_logout: 'Выйти',
    create_post_title: 'Создать пост',
    create_post_placeholder: 'Что у вас нового?',
    create_post_button: 'Опубликовать',
    attach_file_label: 'Прикрепить файл',
    feed_header: 'Лента',
    search_users_title: 'Поиск пользователей',
    search_placeholder: 'Введите username',
    recommendations_title: 'Рекомендации',
    rec_settings_title: 'Настройки рекомендаций',
    rec_reset: 'Сбросить настройки',
    feed_footer: 'Все данные этой ленты хранятся на сервере в SQL базе с шифрованием.',

    profile_subtitle: 'Профиль пользователя',
    edit_bio_title: 'Редактировать био',
    edit_bio_button: 'Сохранить',
    bio_placeholder: 'Расскажите о себе...',
    avatar_upload_label: 'Фото профиля',
    avatar_upload_button: 'Загрузить фото',
    posts_label: 'Постов',
    followers_label: 'Подписчики',
    following_label: 'Подписки',
    story_score_label: 'Story Score',
    post_mood_label: 'Настроение',
    my_posts_title: 'Мои посты',
    profile_footer: 'Профиль и статистика загружаются из SQL базы с шифрованием.',

    user_subtitle: 'Профиль пользователя',
    user_posts_title: 'Посты пользователя',
    user_footer: 'Страница другого пользователя; данные из SQL базы с шифрованием.',

    relations_title_followers: 'Подписчики',
    relations_title_following: 'Подписки',
    relations_footer: 'Список хранится в SQL базе с шифрованием.',

    error_fill_all: 'Заполните все поля.',
    error_username_exists: 'Такой username уже существует.',
    error_email_exists: 'Такой email уже зарегистрирован.',
    error_password_short: 'Минимальная длина пароля — 8 символов.',
    error_login_fields: 'Введите логин и пароль.',
    error_user_not_found: 'Пользователь не найден.',
    error_wrong_password: 'Неверный пароль.',

    no_recommendations: 'Пока нет рекомендаций.',
    bio_empty: 'Био пока не заполнено.',

    feed_network_stats: 'Статистика сети',
    stat_users: 'Пользователи',
    stat_posts: 'Посты',
    stat_comments: 'Комментарии',
    feed_last_users: 'Последние зарегистрированные',

    messages_title: 'Сообщения',
    messages_recent: 'Недавние диалоги',
    messages_recommendations: 'Рекомендации — кому написать',
    messages_search_placeholder: 'Поиск пользователя...',
    messages_dialog: 'Диалог',
    messages_choose_user: 'Выберите пользователя слева',
    messages_placeholder: 'Написать сообщение...',
    messages_send: 'Отправить',
    messages_footer: 'Сообщения хранятся на сервере в SQL базе с шифрованием.',
    no_conversations: 'Пока нет диалогов.',
    no_recommendations_msg: 'Нет рекомендаций.',
    no_users_yet: 'Пока нет пользователей.',

    crop_title: 'Обрезать фото',
    crop_cancel: 'Отмена',
    crop_confirm: 'Обрезать',
    crop_size: 'Размер',

    like: 'Лайк',
    unlike: 'Убрать лайк',
    delete_post: 'Удалить',
    likes_word: 'лайков',
    comment: 'Комментировать',
    comments_word: 'комментариев',
    comment_placeholder: 'Написать комментарий...',
    submit_comment: 'Отправить',
    repost: 'Репост',
    reposts_word: 'репостов',
    reposted: 'Репостнуто',

    follow: 'Подписаться',
    unfollow: 'Отписаться',
    followers_word: 'подписчиков',

    attachment_label: 'Вложение',
    attachment_download: 'Скачать файл',

    lang_cs: 'Čeština',
    lang_ru: 'Русский',
    lang_en: 'English',

    nav_messages: 'Сообщения'
  },
  en: {
    app_title: 'Tell ur story',
    subtitle: 'Local social network (SQL database with encryption)',
    login_tab: 'Login',
    register_tab: 'Register',
    login_identifier_label: 'Username or Email',
    login_password_label: 'Password',
    login_button: 'Login',
    register_username_label: 'Username',
    register_email_label: 'Email',
    register_password_label: 'Password',
    register_button: 'Sign up',
    footer_index: 'Project for graduation — data on server in SQL database with encryption.',

    feed_title: 'Tell ur story',
    feed_subtitle: 'Feed',
    nav_feed: 'Feed',
    nav_profile: 'Profile',
    nav_my_profile: 'My profile',
    nav_logout: 'Log out',
    create_post_title: 'Create post',
    create_post_placeholder: "What's new?",
    create_post_button: 'Publish',
    attach_file_label: 'Attach file',
    feed_header: 'Feed',
    search_users_title: 'User search',
    search_placeholder: 'Enter username',
    recommendations_title: 'Recommendations',
    rec_settings_title: 'Recommendation Settings',
    rec_reset: 'Reset settings',
    feed_footer: 'All feed data is stored on the server in SQL database with encryption.',

    profile_subtitle: 'User profile',
    edit_bio_title: 'Edit bio',
    edit_bio_button: 'Save',
    bio_placeholder: 'Tell something about yourself...',
    avatar_upload_label: 'Profile photo',
    avatar_upload_button: 'Upload photo',
    posts_label: 'Posts',
    followers_label: 'Followers',
    following_label: 'Following',
    story_score_label: 'Story Score',
    post_mood_label: 'Mood',
    my_posts_title: 'My posts',
    profile_footer: 'Profile and stats are loaded from SQL database with encryption.',

    user_subtitle: 'User profile',
    user_posts_title: 'User posts',
    user_footer: 'Viewing another user; data from SQL database with encryption.',

    relations_title_followers: 'Followers',
    relations_title_following: 'Following',
    relations_footer: 'The list is stored in SQL database with encryption.',

    error_fill_all: 'Fill in all fields.',
    error_username_exists: 'This username already exists.',
    error_email_exists: 'This email is already registered.',
    error_password_short: 'Password must be at least 8 characters.',
    error_login_fields: 'Enter login and password.',
    error_user_not_found: 'User not found.',
    error_wrong_password: 'Wrong password.',

    no_recommendations: 'No recommendations yet.',
    bio_empty: 'Bio is empty.',

    feed_network_stats: 'Network stats',
    stat_users: 'Users',
    stat_posts: 'Posts',
    stat_comments: 'Comments',
    feed_last_users: 'Last registered users',

    messages_title: 'Messages',
    messages_recent: 'Recent conversations',
    messages_recommendations: 'Recommendations — write to',
    messages_search_placeholder: 'Search user...',
    messages_dialog: 'Dialog',
    messages_choose_user: 'Choose a user on the left',
    messages_placeholder: 'Write a message...',
    messages_send: 'Send',
    messages_footer: 'Messages are stored on the server in SQL database with encryption.',
    no_conversations: 'No conversations yet.',
    no_recommendations_msg: 'No recommendations.',
    no_users_yet: 'No users yet.',

    crop_title: 'Crop image',
    crop_cancel: 'Cancel',
    crop_confirm: 'Crop',
    crop_size: 'Size',

    like: 'Like',
    unlike: 'Unlike',
    delete_post: 'Delete',
    likes_word: 'likes',
    comment: 'Comment',
    comments_word: 'comments',
    comment_placeholder: 'Write a comment...',
    submit_comment: 'Submit',
    repost: 'Repost',
    reposts_word: 'reposts',
    reposted: 'Reposted',

    follow: 'Follow',
    unfollow: 'Unfollow',
    followers_word: 'followers',

    attachment_label: 'Attachment',
    attachment_download: 'Download file',

    nav_messages: 'Messages',

    lang_cs: 'Čeština',
    lang_ru: 'Русский',
    lang_en: 'English'
  }
};

function getLanguage() {
  return localStorage.getItem(LANGUAGE_KEY) || 'cs';
}

function setLanguage(lang) {
  localStorage.setItem(LANGUAGE_KEY, lang);
}

function t(key) {
  const lang = getLanguage();
  const table = TRANSLATIONS[lang] || TRANSLATIONS.cs;
  return table[key] || TRANSLATIONS.cs[key] || key;
}

// Применяет переводы ко всем элементам с атрибутом data-i18n
function applyTranslations(root = document) {
  const lang = getLanguage();
  if (root.documentElement) {
    root.documentElement.lang = lang;
  } else {
    document.documentElement.lang = lang;
  }

  const elements = root.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const text = t(key);

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.hasAttribute('placeholder')) {
        el.placeholder = text;
      } else {
        el.value = text;
      }
    } else {
      el.textContent = text;
    }
  });
}

// Глобальный объект для использования в script.js
window.I18n = {
  t,
  getLanguage,
  setLanguage,
  apply: applyTranslations
};

