"""
Flask app for the social network. REST API for the frontend.
"""

from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
import hashlib
import os
from datetime import datetime
from database import get_db_connection, init_database
from file_handler import save_file, delete_file, get_file_type

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-in-production'
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CORS(app, supports_credentials=True)
init_database()


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def require_auth():
    return session.get('user_id')


def get_current_user_id():
    return session.get('user_id')


# --- API ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not username or not email or not password:
        return jsonify({'success': False, 'message': 'Заполните все поля'}), 400
    
    if len(password) < 8:
        return jsonify({'success': False, 'message': 'Пароль должен быть не менее 8 символов'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE username = ? OR email = ?', (username, email))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пользователь с таким username или email уже существует'}), 400
    
    password_hash = hash_password(password)
    created_at = datetime.now().isoformat()
    
    cursor.execute('''
        INSERT INTO Users (username, email, passwordHash, createdAt)
        VALUES (?, ?, ?, ?)
    ''', (username, email, password_hash, created_at))
    
    user_id = cursor.lastrowid
    conn.commit()
    
    session['user_id'] = user_id
    
    cursor.execute('SELECT id, username, email, bio, avatar, createdAt FROM Users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Регистрация успешна',
        'user': dict(user)
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')
    
    if not identifier or not password:
        return jsonify({'success': False, 'message': 'Заполните все поля'}), 400
    
    password_hash = hash_password(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE (username = ? OR email = ?) AND passwordHash = ?
    ''', (identifier, identifier, password_hash))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'success': False, 'message': 'Неверный логин или пароль'}), 401
    
    session['user_id'] = user['id']
    
    return jsonify({
        'success': True,
        'message': 'Вход выполнен успешно',
        'user': dict(user)
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True, 'message': 'Выход выполнен'})


@app.route('/api/current-user', methods=['GET'])
def get_current_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'success': False, 'user': None}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE id = ?
    ''', (user_id,))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'success': False, 'user': None}), 404
    
    return jsonify({'success': True, 'user': dict(user)})


@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE id = ?
    ''', (user_id,))
    
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    return jsonify({'success': True, 'user': dict(user)})


@app.route('/api/users/search', methods=['GET'])
def search_users():
    """
    Поиск пользователей по username.
    
    Query params:
        q (str): Поисковый запрос
        
    Returns:
        JSON: {"success": bool, "users": [...]}
    """
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'success': True, 'users': []})
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE username LIKE ?
        LIMIT 20
    ''', (f'%{query}%',))
    
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'success': True, 'users': users})


@app.route('/api/posts', methods=['GET'])
def get_posts():
    """
    Получает список всех постов.
    
    Query params:
        userId (int, optional): Фильтр по ID пользователя
        
    Returns:
        JSON: {"success": bool, "posts": [...]}
    """
    user_id_filter = request.args.get('userId', type=int)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if user_id_filter:
        cursor.execute('''
            SELECT id, userId, content, createdAt, attentionSum, viewsCount
            FROM Posts
            WHERE userId = ?
            ORDER BY createdAt DESC
        ''', (user_id_filter,))
    else:
        cursor.execute('''
            SELECT id, userId, content, createdAt, attentionSum, viewsCount
            FROM Posts
            ORDER BY createdAt DESC
        ''')
    
    posts = [dict(row) for row in cursor.fetchall()]
    
    for post in posts:
        cursor.execute('''
            SELECT id, fileName, filePath, fileType
            FROM Files
            WHERE postId = ?
        ''', (post['id'],))
        post['files'] = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM Likes WHERE postId = ? GROUP BY reactionType', (post['id'],))
        post['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
        for row in cursor.fetchall():
            t = (row['reactionType'] or 'heart').lower()
            if t in post['reactionCounts']:
                post['reactionCounts'][t] = row['cnt']
        post['likesCount'] = sum(post['reactionCounts'].values())
        
        cursor.execute('SELECT COUNT(*) as count FROM Comments WHERE postId = ?', (post['id'],))
        post['commentsCount'] = cursor.fetchone()['count']
        
        cursor.execute('SELECT COUNT(*) as count FROM Reposts WHERE originalPostId = ?', (post['id'],))
        post['repostsCount'] = cursor.fetchone()['count']
        
        current_user_id = get_current_user_id()
        if current_user_id:
            cursor.execute('SELECT reactionType FROM Likes WHERE postId = ? AND userId = ?', (post['id'], current_user_id))
            r = cursor.fetchone()
            post['liked'] = r is not None
            post['currentUserReaction'] = (r['reactionType'] or 'heart').lower() if r else None
            cursor.execute('SELECT id FROM Reposts WHERE originalPostId = ? AND userId = ?', (post['id'], current_user_id))
            post['reposted'] = cursor.fetchone() is not None
        else:
            post['liked'] = False
            post['currentUserReaction'] = None
            post['reposted'] = False
    
    conn.close()
    
    return jsonify({'success': True, 'posts': posts})


@app.route('/api/posts', methods=['POST'])
def create_post():
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    content = request.form.get('content', '').strip()
    file = request.files.get('file')
    
    if not content and not file:
        return jsonify({'success': False, 'message': 'Пост не может быть пустым'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Posts (userId, content, createdAt)
        VALUES (?, ?, ?)
    ''', (user_id, content, created_at))
    
    post_id = cursor.lastrowid
    
    file_info = None
    if file:
        file_info = save_file(file, user_id, post_id)
        if file_info:
            cursor.execute('''
                INSERT INTO Files (postId, userId, fileName, filePath, fileType, createdAt)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (post_id, user_id, file_info['fileName'], file_info['filePath'], 
                  file_info['fileType'], created_at))
    
    conn.commit()
    
    cursor.execute('''
        SELECT id, userId, content, createdAt, attentionSum, viewsCount
        FROM Posts
        WHERE id = ?
    ''', (post_id,))
    post = dict(cursor.fetchone())
    
    cursor.execute('''
        SELECT id, fileName, filePath, fileType
        FROM Files
        WHERE postId = ?
    ''', (post_id,))
    post['files'] = [dict(row) for row in cursor.fetchall()]
    post['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    post['likesCount'] = 0
    post['commentsCount'] = 0
    post['repostsCount'] = 0
    post['liked'] = False
    post['currentUserReaction'] = None
    post['reposted'] = False
    
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Пост создан',
        'post': post
    }), 201


@app.route('/api/posts/<int:post_id>', methods=['DELETE'])
def delete_post(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT userId FROM Posts WHERE id = ?', (post_id,))
    post = cursor.fetchone()
    
    if not post:
        conn.close()
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    if post['userId'] != user_id:
        conn.close()
        return jsonify({'success': False, 'message': 'Нет прав на удаление'}), 403
    
    cursor.execute('SELECT filePath FROM Files WHERE postId = ?', (post_id,))
    files = cursor.fetchall()
    for file_row in files:
        delete_file(file_row['filePath'])
    
    cursor.execute('DELETE FROM Posts WHERE id = ?', (post_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Пост удален'})


@app.route('/api/posts/<int:post_id>/like', methods=['POST'])
def toggle_like(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401

    data = (request.get_json() or {})
    reaction_type = (data.get('reactionType') or 'heart').strip().lower()
    if reaction_type not in ('heart', 'fire', 'laugh', 'wow'):
        reaction_type = 'heart'

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404

    cursor.execute('SELECT id, reactionType FROM Likes WHERE postId = ? AND userId = ?', (post_id, user_id))
    like = cursor.fetchone()
    created_at = datetime.now().isoformat()

    cursor.execute('SELECT id, reactionType FROM Likes WHERE postId = ? AND userId = ?', (post_id, user_id))
    like = cursor.fetchone()
    created_at = datetime.now().isoformat()

    if like:
        old_type = (like['reactionType'] or 'heart').lower()
        if old_type == reaction_type:
            cursor.execute('DELETE FROM Likes WHERE postId = ? AND userId = ?', (post_id, user_id))
            liked = False
            current_reaction = None
        else:
            cursor.execute('UPDATE Likes SET reactionType = ? WHERE postId = ? AND userId = ?', (reaction_type, post_id, user_id))
            liked = True
            current_reaction = reaction_type
    else:
        cursor.execute('''
            INSERT INTO Likes (postId, userId, reactionType, createdAt)
            VALUES (?, ?, ?, ?)
        ''', (post_id, user_id, reaction_type, created_at))
        liked = True
        current_reaction = reaction_type

    cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM Likes WHERE postId = ? GROUP BY reactionType', (post_id,))
    counts = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    for row in cursor.fetchall():
        t = (row['reactionType'] or 'heart').lower()
        if t in counts:
            counts[t] = row['cnt']

    if not liked:
        cursor.execute('SELECT reactionType FROM Likes WHERE postId = ? AND userId = ?', (post_id, user_id))
        r = cursor.fetchone()
        current_reaction = (r['reactionType'] or 'heart').lower() if r else None
    # current_reaction already set when liked

    attention_delta = 5 if liked else 2
    cursor.execute('''
        UPDATE Posts SET attentionSum = attentionSum + ?, viewsCount = viewsCount + 1 WHERE id = ?
    ''', (attention_delta, post_id))

    conn.commit()
    conn.close()

    return jsonify({
        'success': True,
        'liked': liked,
        'reactionCounts': counts,
        'currentUserReaction': current_reaction
    })


@app.route('/api/posts/<int:post_id>/comments', methods=['GET'])
def get_comments(post_id):
    """
    Получает комментарии к посту.
    
    Args:
        post_id (int): ID поста
        
    Returns:
        JSON: {"success": bool, "comments": [...]}
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT c.id, c.postId, c.userId, c.content, c.createdAt,
               u.username, u.avatar
        FROM Comments c
        JOIN Users u ON c.userId = u.id
        WHERE c.postId = ?
        ORDER BY c.createdAt ASC
    ''', (post_id,))
    
    comments = []
    for row in cursor.fetchall():
        comment = dict(row)
        comments.append(comment)
    
    conn.close()
    
    return jsonify({'success': True, 'comments': comments})


@app.route('/api/posts/<int:post_id>/comments', methods=['POST'])
def create_comment(post_id):
    """
    Создает комментарий к посту.
    
    Args:
        post_id (int): ID поста
        
    Request body:
        {
            "content": "string"
        }
        
    Returns:
        JSON: {"success": bool, "message": "string", "comment": {...}}
    """
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    data = request.get_json()
    content = data.get('content', '').strip()
    
    if not content:
        return jsonify({'success': False, 'message': 'Комментарий не может быть пустым'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Comments (postId, userId, content, createdAt)
        VALUES (?, ?, ?, ?)
    ''', (post_id, user_id, content, created_at))
    
    comment_id = cursor.lastrowid
    
    cursor.execute('''
        SELECT c.id, c.postId, c.userId, c.content, c.createdAt,
               u.username, u.avatar
        FROM Comments c
        JOIN Users u ON c.userId = u.id
        WHERE c.id = ?
    ''', (comment_id,))
    
    comment = dict(cursor.fetchone())
    
    # comment = strong engagement signal, bump attention
    cursor.execute('''
        UPDATE Posts
        SET attentionSum = attentionSum + ?, viewsCount = viewsCount + 1
        WHERE id = ?
    ''', (12, post_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Комментарий добавлен',
        'comment': comment
    }), 201


@app.route('/api/posts/<int:post_id>/repost', methods=['POST'])
def create_repost(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    cursor.execute('SELECT id FROM Reposts WHERE originalPostId = ? AND userId = ?', (post_id, user_id))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Вы уже репостили этот пост'}), 400
    
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Reposts (originalPostId, userId, createdAt)
        VALUES (?, ?, ?)
    ''', (post_id, user_id, created_at))
    
    repost_id = cursor.lastrowid
    
    # repost = engagement signal
    cursor.execute('''
        UPDATE Posts
        SET attentionSum = attentionSum + ?, viewsCount = viewsCount + 1
        WHERE id = ?
    ''', (8, post_id))
    
    conn.commit()
    
    repost = {
        'id': repost_id,
        'originalPostId': post_id,
        'userId': user_id,
        'createdAt': created_at
    }
    
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Репост создан',
        'repost': repost
    }), 201


@app.route('/api/follow/<int:user_id>', methods=['POST'])
def follow_user(user_id):
    """
    Подписывается на пользователя или отписывается от него.
    
    Args:
        user_id (int): ID пользователя, на которого подписываемся
        
    Returns:
        JSON: {"success": bool, "following": bool}
    """
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    if current_user_id == user_id:
        return jsonify({'success': False, 'message': 'Нельзя подписаться на себя'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    cursor.execute('SELECT * FROM Followers WHERE followerId = ? AND followingId = ?', 
                   (current_user_id, user_id))
    existing = cursor.fetchone()
    
    created_at = datetime.now().isoformat()
    
    if existing:
        cursor.execute('DELETE FROM Followers WHERE followerId = ? AND followingId = ?',
                      (current_user_id, user_id))
        following = False
    else:
        cursor.execute('''
            INSERT INTO Followers (followerId, followingId, createdAt)
            VALUES (?, ?, ?)
        ''', (current_user_id, user_id, created_at))
        following = True
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'following': following
    })


@app.route('/api/users/<int:user_id>/followers', methods=['GET'])
def get_followers(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT u.id, u.username, u.email, u.bio, u.avatar, u.createdAt
        FROM Users u
        JOIN Followers f ON u.id = f.followerId
        WHERE f.followingId = ?
    ''', (user_id,))
    
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'success': True, 'users': users})


@app.route('/api/users/<int:user_id>/following', methods=['GET'])
def get_following(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT u.id, u.username, u.email, u.bio, u.avatar, u.createdAt
        FROM Users u
        JOIN Followers f ON u.id = f.followingId
        WHERE f.followerId = ?
    ''', (user_id,))
    
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'success': True, 'users': users})


@app.route('/api/messages', methods=['GET'])
def get_messages():
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401

    try:
        other_id = int(request.args.get('withUser', ''))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'withUser is required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE id = ?', (other_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

    cursor.execute('''
        SELECT m.id, m.fromUserId, m.toUserId, m.content, m.createdAt,
               uf.username AS fromUsername,
               ut.username AS toUsername
        FROM Messages m
        JOIN Users uf ON m.fromUserId = uf.id
        JOIN Users ut ON m.toUserId = ut.id
        WHERE (m.fromUserId = ? AND m.toUserId = ?)
           OR (m.fromUserId = ? AND m.toUserId = ?)
        ORDER BY m.createdAt ASC
    ''', (current_user_id, other_id, other_id, current_user_id))

    messages = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'success': True, 'messages': messages})


@app.route('/api/messages', methods=['POST'])
def send_message():
    from_user_id = require_auth()
    if not from_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401

    data = request.get_json() or {}
    to_user_id = data.get('toUserId')
    content = (data.get('content') or '').strip()

    try:
        to_user_id = int(to_user_id)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Некорректный получатель'}), 400

    if not content:
        return jsonify({'success': False, 'message': 'Сообщение не может быть пустым'}), 400

    if to_user_id == from_user_id:
        return jsonify({'success': False, 'message': 'Нельзя писать самому себе'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE id = ?', (to_user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Messages (fromUserId, toUserId, content, createdAt)
        VALUES (?, ?, ?, ?)
    ''', (from_user_id, to_user_id, content, created_at))

    message_id = cursor.lastrowid
    conn.commit()

    cursor.execute('''
        SELECT m.id, m.fromUserId, m.toUserId, m.content, m.createdAt,
               uf.username AS fromUsername,
               ut.username AS toUsername
        FROM Messages m
        JOIN Users uf ON m.fromUserId = uf.id
        JOIN Users ut ON m.toUserId = ut.id
        WHERE m.id = ?
    ''', (message_id,))

    message = dict(cursor.fetchone())
    conn.close()

    return jsonify({'success': True, 'message': message})


@app.route('/api/messages/conversations', methods=['GET'])
def get_conversations():
    """
    Список пользователей, с которыми есть переписка (для быстрого доступа).
    """
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT DISTINCT
            CASE WHEN fromUserId = ? THEN toUserId ELSE fromUserId END AS partnerId
        FROM Messages
        WHERE fromUserId = ? OR toUserId = ?
    ''', (current_user_id, current_user_id, current_user_id))
    partner_ids = [row['partnerId'] for row in cursor.fetchall()]
    if not partner_ids:
        conn.close()
        return jsonify({'success': True, 'users': []})

    ph = ','.join(['?'] * len(partner_ids))
    cursor.execute(f'''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE id IN ({ph})
    ''', partner_ids)
    users = [dict(row) for row in cursor.fetchall()]
    # Последнее сообщение для сортировки
    for u in users:
        cursor.execute('''
            SELECT createdAt FROM Messages
            WHERE (fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)
            ORDER BY createdAt DESC LIMIT 1
        ''', (current_user_id, u['id'], u['id'], current_user_id))
        r = cursor.fetchone()
        u['lastMessageAt'] = r['createdAt'] if r else None
    users.sort(key=lambda x: (x.get('lastMessageAt') or ''), reverse=True)
    conn.close()
    return jsonify({'success': True, 'users': users})


@app.route('/api/stats', methods=['GET'])
def get_network_stats():
    """Статистика сети: количество пользователей, постов, комментариев."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as c FROM Users')
    users_count = cursor.fetchone()['c']
    cursor.execute('SELECT COUNT(*) as c FROM Posts')
    posts_count = cursor.fetchone()['c']
    cursor.execute('SELECT COUNT(*) as c FROM Comments')
    comments_count = cursor.fetchone()['c']
    conn.close()
    return jsonify({
        'success': True,
        'stats': {
            'usersCount': users_count,
            'postsCount': posts_count,
            'commentsCount': comments_count
        }
    })


@app.route('/api/users/recent', methods=['GET'])
def get_recent_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        ORDER BY createdAt DESC
        LIMIT 5
    ''')
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({'success': True, 'users': users})


@app.route('/api/users/<int:user_id>/stats', methods=['GET'])
def get_user_stats(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as count FROM Posts WHERE userId = ?', (user_id,))
    posts_count = cursor.fetchone()['count']
    
    cursor.execute('SELECT COUNT(*) as count FROM Followers WHERE followingId = ?', (user_id,))
    followers_count = cursor.fetchone()['count']
    
    cursor.execute('SELECT COUNT(*) as count FROM Followers WHERE followerId = ?', (user_id,))
    following_count = cursor.fetchone()['count']
    
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM Likes l
        JOIN Posts p ON l.postId = p.id
        WHERE p.userId = ?
    ''', (user_id,))
    likes_received = cursor.fetchone()['count']
    
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM Comments c
        JOIN Posts p ON c.postId = p.id
        WHERE p.userId = ?
    ''', (user_id,))
    comments_received = cursor.fetchone()['count']
    
    cursor.execute('''
        SELECT COUNT(*) as count
        FROM Reposts r
        JOIN Posts p ON r.originalPostId = p.id
        WHERE p.userId = ?
    ''', (user_id,))
    reposts_received = cursor.fetchone()['count']
    
    # avg attention = SUM(attentionSum)/SUM(viewsCount) in seconds
    cursor.execute('''
        SELECT COALESCE(SUM(attentionSum), 0) as attSum, COALESCE(SUM(viewsCount), 0) as viewSum
        FROM Posts
        WHERE userId = ?
    ''', (user_id,))
    att_row = cursor.fetchone()
    att_sum = att_row['attSum'] or 0
    view_sum = att_row['viewSum'] or 0
    avg_attention_seconds = (att_sum / view_sum) if view_sum else 0
    
    conn.close()
    
    return jsonify({
        'success': True,
        'stats': {
            'postsCount': posts_count,
            'followersCount': followers_count,
            'followingCount': following_count,
            'likesReceived': likes_received,
            'commentsReceived': comments_received,
            'repostsReceived': reposts_received,
            'averageAttention': avg_attention_seconds
        }
    })


@app.route('/api/recommendations/users', methods=['GET'])
def get_user_recommendations():
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    def _w(name: str, default: float) -> float:
        """Читает вес из query params и приводит к float."""
        try:
            return float(request.args.get(name, default))
        except (TypeError, ValueError):
            return float(default)

    followers_weight = _w('followersWeight', 1.0)
    common_following_weight = _w('commonFollowingWeight', 2.0)
    posts_weight = _w('postsWeight', 0.5)
    likes_weight = _w('likesWeight', 1.0)
    comments_weight = _w('commentsWeight', 2.0)
    reposts_weight = _w('repostsWeight', 3.0)
    attention_weight = _w('attentionWeight', 0.5)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Кого уже фолловим (и себя) — исключаем
    cursor.execute('SELECT followingId FROM Followers WHERE followerId = ?', (current_user_id,))
    exclude_ids = [row['followingId'] for row in cursor.fetchall()]
    exclude_ids.append(current_user_id)

    placeholders = ','.join(['?'] * len(exclude_ids)) if exclude_ids else ''
    if exclude_ids:
        cursor.execute(f'''
            SELECT id, username, email, bio, avatar, createdAt
            FROM Users
            WHERE id NOT IN ({placeholders})
        ''', exclude_ids)
    else:
        cursor.execute('SELECT id, username, email, bio, avatar, createdAt FROM Users')

    candidates = [dict(row) for row in cursor.fetchall()]
    if not candidates:
        conn.close()
        return jsonify({'success': True, 'users': []})

    candidate_ids = [c['id'] for c in candidates]
    cph = ','.join(['?'] * len(candidate_ids))

    # followersCount
    cursor.execute(f'''
        SELECT followingId as userId, COUNT(*) as cnt
        FROM Followers
        WHERE followingId IN ({cph})
        GROUP BY followingId
    ''', candidate_ids)
    followers_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    # postsCount + attention sums
    cursor.execute(f'''
        SELECT userId, COUNT(*) as postsCnt,
               COALESCE(SUM(attentionSum), 0) as attSum,
               COALESCE(SUM(viewsCount), 0) as viewSum
        FROM Posts
        WHERE userId IN ({cph})
        GROUP BY userId
    ''', candidate_ids)
    posts_map = {}
    att_map = {}
    for row in cursor.fetchall():
        posts_map[row['userId']] = row['postsCnt']
        att_sum = row['attSum'] or 0
        view_sum = row['viewSum'] or 0
        att_map[row['userId']] = (att_sum / view_sum) if view_sum else 0

    # likesReceived
    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Likes l
        JOIN Posts p ON l.postId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    likes_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    # commentsReceived
    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Comments c
        JOIN Posts p ON c.postId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    comments_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    # repostsReceived
    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Reposts r
        JOIN Posts p ON r.originalPostId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    reposts_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    # commonFollowing (сколько одинаковых подписок у current_user_id и кандидата)
    cursor.execute(f'''
        SELECT f2.followerId as userId, COUNT(*) as cnt
        FROM Followers f1
        JOIN Followers f2 ON f1.followingId = f2.followingId
        WHERE f1.followerId = ? AND f2.followerId IN ({cph})
        GROUP BY f2.followerId
    ''', [current_user_id] + candidate_ids)
    common_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    scored = []
    for u in candidates:
        uid = u['id']
        followers_count = int(followers_map.get(uid, 0))
        common_following = int(common_map.get(uid, 0))
        posts_count = int(posts_map.get(uid, 0))
        likes_received = int(likes_map.get(uid, 0))
        comments_received = int(comments_map.get(uid, 0))
        reposts_received = int(reposts_map.get(uid, 0))
        average_attention_seconds = float(att_map.get(uid, 0))

        score = (
            followers_weight * followers_count +
            common_following_weight * common_following +
            posts_weight * posts_count +
            likes_weight * likes_received +
            comments_weight * comments_received +
            reposts_weight * reposts_received +
            attention_weight * average_attention_seconds
        )

        scored.append({'user': u, 'score': score})

    scored.sort(key=lambda x: x['score'], reverse=True)
    top = []
    for item in scored[:10]:
        user = item['user']
        user['score'] = item['score']
        top.append(user)

    conn.close()
    return jsonify({'success': True, 'users': top})


@app.route('/api/recommendations/posts', methods=['GET'])
def get_post_recommendations():
    """
    Получает рекомендации постов для текущего пользователя.
    
    Returns:
        JSON: {"success": bool, "posts": [...]}
    """
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    def _w(name: str, default: float) -> float:
        try:
            return float(request.args.get(name, default))
        except (TypeError, ValueError):
            return float(default)

    likes_weight = _w('likesWeight', 1.0)
    comments_weight = _w('commentsWeight', 2.0)
    reposts_weight = _w('repostsWeight', 3.0)
    attention_weight = _w('attentionWeight', 0.5)
    freshness_weight = _w('freshnessWeight', 2.0)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Берём базовый набор постов (ограничим 200 для скорости на SQLite)
    cursor.execute('''
        SELECT p.id, p.userId, p.content, p.createdAt, p.attentionSum, p.viewsCount,
               COALESCE(l.likes, 0) as likes,
               COALESCE(c.comments, 0) as comments,
               COALESCE(r.reposts, 0) as reposts
        FROM Posts p
        LEFT JOIN (SELECT postId, COUNT(*) as likes FROM Likes GROUP BY postId) l ON l.postId = p.id
        LEFT JOIN (SELECT postId, COUNT(*) as comments FROM Comments GROUP BY postId) c ON c.postId = p.id
        LEFT JOIN (SELECT originalPostId, COUNT(*) as reposts FROM Reposts GROUP BY originalPostId) r ON r.originalPostId = p.id
        ORDER BY p.createdAt DESC
        LIMIT 200
    ''')

    rows = cursor.fetchall()
    if not rows:
        conn.close()
        return jsonify({'success': True, 'posts': []})

    now = datetime.now()
    scored = []
    for row in rows:
        post = dict(row)
        views = int(post.get('viewsCount') or 0)
        att_sum = float(post.get('attentionSum') or 0)
        average_attention_seconds = (att_sum / views) if views else 0.0

        try:
            created = datetime.fromisoformat(post['createdAt'])
        except Exception:
            created = now
        hours_since_post = max(0.0, (now - created).total_seconds() / 3600.0)

        base_score = (
            likes_weight * float(post.get('likes') or 0) +
            comments_weight * float(post.get('comments') or 0) +
            reposts_weight * float(post.get('reposts') or 0) +
            attention_weight * float(average_attention_seconds)
        )
        freshness_score = freshness_weight * (1.0 / (1.0 + hours_since_post))
        score = base_score + freshness_score

        post['averageAttentionSeconds'] = average_attention_seconds
        post['hoursSincePost'] = hours_since_post
        scored.append({'post': post, 'score': score})

    scored.sort(key=lambda x: x['score'], reverse=True)
    top_posts = [item['post'] for item in scored[:20]]

    # Добавляем информацию о файлах, реакциях по типам, liked/reposted для текущего пользователя
    for post in top_posts:
        post_id = post['id']

        cursor.execute('SELECT id, fileName, filePath, fileType FROM Files WHERE postId = ?', (post_id,))
        post['files'] = [dict(r) for r in cursor.fetchall()]

        cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM Likes WHERE postId = ? GROUP BY reactionType', (post_id,))
        post['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
        for r in cursor.fetchall():
            t = (r['reactionType'] or 'heart').lower()
            if t in post['reactionCounts']:
                post['reactionCounts'][t] = r['cnt']
        post['likesCount'] = sum(post['reactionCounts'].values())
        post['commentsCount'] = int(post.get('comments') or 0)
        post['repostsCount'] = int(post.get('reposts') or 0)

        cursor.execute('SELECT reactionType FROM Likes WHERE postId = ? AND userId = ? LIMIT 1', (post_id, current_user_id))
        r = cursor.fetchone()
        post['liked'] = r is not None
        post['currentUserReaction'] = (r['reactionType'] or 'heart').lower() if r else None

        cursor.execute('SELECT 1 FROM Reposts WHERE originalPostId = ? AND userId = ? LIMIT 1', (post_id, current_user_id))
        post['reposted'] = cursor.fetchone() is not None

        post['score'] = next((x['score'] for x in scored if x['post']['id'] == post_id), None)
        post.pop('likes', None)
        post.pop('comments', None)
        post.pop('reposts', None)

    conn.close()
    return jsonify({'success': True, 'posts': top_posts})


@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    """
    Обновляет профиль пользователя (bio и avatar).
    
    Request body (form-data):
        bio (str, optional): Биография пользователя
        avatar (file, optional): Фото профиля
        
    Returns:
        JSON: {"success": bool, "message": "string", "user": {...}}
    """
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Требуется авторизация'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    bio = request.form.get('bio', '').strip()
    avatar_file = request.files.get('avatar')
    
    updates = []
    params = []
    
    if bio is not None:
        updates.append('bio = ?')
        params.append(bio)
    
    if avatar_file:
        # Сохраняем новое фото
        file_info = save_file(avatar_file, user_id)
        if file_info:
            # Удаляем старое фото, если есть
            cursor.execute('SELECT avatar FROM Users WHERE id = ?', (user_id,))
            old_avatar = cursor.fetchone()['avatar']
            if old_avatar and os.path.exists(old_avatar):
                delete_file(old_avatar)
            
            updates.append('avatar = ?')
            params.append(file_info['filePath'])
    
    if updates:
        params.append(user_id)
        cursor.execute(f'''
            UPDATE Users
            SET {', '.join(updates)}
            WHERE id = ?
        ''', params)
        conn.commit()
    
    # Получаем обновленного пользователя
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE id = ?
    ''', (user_id,))
    
    user = dict(cursor.fetchone())
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Профиль обновлен',
        'user': user
    })


@app.route('/api/files/<path:filename>')
def serve_file(filename):
    """
    Отдает файлы для фронтенда.
    
    Args:
        filename (str): Путь к файлу относительно папки uploads
        
    Returns:
        File: Файл для скачивания/просмотра
    """
    # Обрабатываем путь вида "userId/filename"
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# ========= Раздача фронтенда (HTML, CSS, JS) — маршруты в конце, чтобы не перехватывать /api/ =========

@app.route('/')
def index():
    """Главная страница — вход/регистрация."""
    return send_from_directory(ROOT_DIR, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    """
    Раздает статические файлы: HTML-страницы, CSS, JS.
    Вызывается только для путей, не совпавших с /api/...
    """
    if path.startswith('api/'):
        from flask import abort
        abort(404)
    allowed = ('.html', '.css', '.js', '.ico', '.png', '.jpg', '.svg', '.woff', '.woff2')
    if any(path.lower().endswith(ext) for ext in allowed):
        return send_from_directory(ROOT_DIR, path)
    if '.' not in path:
        return send_from_directory(ROOT_DIR, path + '.html')
    from flask import abort
    abort(404)


if __name__ == '__main__':
    # Создаем папку для загрузок, если её нет
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    
    # Запускаем сервер на всех интерфейсах (0.0.0.0) для доступа в локальной сети
    app.run(host='0.0.0.0', port=5000, debug=True)
