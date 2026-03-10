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


# Цвета для анонимных аватаров (стабильный выбор по seed)
ANONYMOUS_COLORS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f43f5e', '#3b82f6', '#a855f7'
]


def get_anonymous_color(seed):
    if seed is None:
        return ANONYMOUS_COLORS[0]
    return ANONYMOUS_COLORS[abs(hash(seed)) % len(ANONYMOUS_COLORS)]


def update_user_last_active(user_id):
    if not user_id:
        return
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE Users SET lastActive = ? WHERE id = ?', (datetime.now().isoformat(), user_id))
        conn.commit()
        conn.close()
    except Exception:
        pass


# --- API ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not username or not email or not password:
        return jsonify({'success': False, 'message': 'Fill in all fields'}), 400
    
    if len(password) < 8:
        return jsonify({'success': False, 'message': 'Password must be at least 8 characters'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE username = ? OR email = ?', (username, email))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'User with this username or email already exists'}), 400
    
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
        'message': 'Registration successful',
        'user': dict(user)
    }), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    identifier = data.get('identifier', '').strip()
    password = data.get('password', '')
    
    if not identifier or not password:
        return jsonify({'success': False, 'message': 'Fill in all fields'}), 400
    
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
        return jsonify({'success': False, 'message': 'Invalid login or password'}), 401
    
    session['user_id'] = user['id']
    
    return jsonify({
        'success': True,
        'message': 'Login successful',
        'user': dict(user)
    })


@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'success': True, 'message': 'Logged out'})


@app.route('/api/current-user', methods=['GET'])
def get_current_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'success': False, 'user': None}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt, profileBackground, profileAccentColor, profileGradient
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
        SELECT id, username, email, bio, avatar, createdAt, profileBackground, profileAccentColor, profileGradient
        FROM Users
        WHERE id = ?
    ''', (user_id,))
    
    user = cursor.fetchone()
    if not user:
        conn.close()
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
    user = dict(user)
    cursor.execute('SELECT COUNT(*) as c FROM Likes l JOIN Posts p ON l.postId = p.id WHERE p.userId = ?', (user_id,))
    user['likesReceived'] = cursor.fetchone()['c']
    cursor.execute('SELECT COUNT(*) as c FROM Comments c JOIN Posts p ON c.postId = p.id WHERE p.userId = ?', (user_id,))
    user['commentsReceived'] = cursor.fetchone()['c']
    cursor.execute('SELECT COUNT(*) as c FROM Reposts r JOIN Posts p ON r.originalPostId = p.id WHERE p.userId = ?', (user_id,))
    user['repostsReceived'] = cursor.fetchone()['c']
    user['storyScore'] = user['likesReceived'] + user['commentsReceived'] + user['repostsReceived']
    conn.close()
    
    return jsonify({'success': True, 'user': user})


@app.route('/api/users/search', methods=['GET'])
def search_users():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'success': True, 'users': []})
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt
        FROM Users
        WHERE username LIKE ? OR email LIKE ?
        LIMIT 20
    ''', (f'%{query}%', f'%{query}%'))
    
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify({'success': True, 'users': users})


@app.route('/api/posts', methods=['GET'])
def get_posts():
    conn = None
    try:
        user_id_filter = request.args.get('userId', type=int)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if user_id_filter:
            cursor.execute('''
                SELECT id, userId, content, mood, createdAt, attentionSum, viewsCount, isAnonymous
                FROM Posts
                WHERE userId = ?
                ORDER BY createdAt DESC
            ''', (user_id_filter,))
            own_posts = [dict(row) for row in cursor.fetchall()]
            cursor.execute('''
                SELECT r.id as repostId, r.originalPostId, r.userId as repostedByUserId, r.createdAt as repostedAt,
                       p.id as id, p.userId as userId, p.content, p.mood, p.createdAt, p.attentionSum, p.viewsCount, p.isAnonymous
                FROM Reposts r
                JOIN Posts p ON p.id = r.originalPostId
                WHERE r.userId = ?
                ORDER BY r.createdAt DESC
            ''', (user_id_filter,))
            repost_rows = cursor.fetchall()
            posts = list(own_posts)
            for row in repost_rows:
                r = dict(row)
                p = {
                    'id': r['id'],
                    'userId': r['userId'],
                    'content': r['content'],
                    'mood': r.get('mood') or 'happy',
                    'createdAt': r['createdAt'],
                    'attentionSum': r['attentionSum'],
                    'viewsCount': r['viewsCount'],
                    'isAnonymous': r.get('isAnonymous', 0),
                    'isRepost': True,
                    'repostedByUserId': r['repostedByUserId'],
                    'repostedAt': r['repostedAt'],
                }
                posts.append(p)
            # Sort by repostedAt for reposts, createdAt for own; ensure comparable strings
            def sort_key(item):
                t = item.get('repostedAt') or item.get('createdAt')
                return str(t) if t else ''
            posts.sort(key=sort_key, reverse=True)
        else:
            cursor.execute('''
                SELECT id, userId, content, mood, createdAt, attentionSum, viewsCount, isAnonymous
                FROM Posts
                ORDER BY createdAt DESC
            ''')
            posts = [dict(row) for row in cursor.fetchall()]
        
        for post in posts:
            post.setdefault('mood', 'happy')
            post['isAnonymous'] = bool(post.get('isAnonymous', 0))
            post['anonymousColor'] = get_anonymous_color(post['id']) if post['isAnonymous'] else None
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
    except Exception as e:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        return jsonify({'success': False, 'message': str(e), 'posts': []}), 500


@app.route('/api/posts', methods=['POST'])
def create_post():
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    content = request.form.get('content', '').strip()
    file = request.files.get('file')
    mood = (request.form.get('mood') or 'happy').strip().lower()
    if mood not in ('happy', 'sad', 'inspired', 'thinking', 'dark'):
        mood = 'happy'
    anonymous = request.form.get('anonymous', '').strip().lower() in ('1', 'true', 'yes', 'on')

    if not content and not file:
        return jsonify({'success': False, 'message': 'Post cannot be empty'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Posts (userId, content, mood, createdAt, isAnonymous)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, content, mood, created_at, 1 if anonymous else 0))
    
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
        SELECT id, userId, content, mood, createdAt, attentionSum, viewsCount, isAnonymous
        FROM Posts
        WHERE id = ?
    ''', (post_id,))
    post = dict(cursor.fetchone())
    post['isAnonymous'] = bool(post.get('isAnonymous'))
    post['anonymousColor'] = get_anonymous_color(post_id) if post['isAnonymous'] else None
    
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
        'message': 'Post created',
        'post': post
    }), 201


@app.route('/api/posts/<int:post_id>', methods=['GET'])
def get_post(post_id):
    """Один пост для страницы треда."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, userId, content, mood, createdAt, attentionSum, viewsCount, isAnonymous
        FROM Posts WHERE id = ?
    ''', (post_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Post not found'}), 404
    post = dict(row)
    post['isAnonymous'] = bool(post.get('isAnonymous', 0))
    post['anonymousColor'] = get_anonymous_color(post['id']) if post['isAnonymous'] else None
    cursor.execute('SELECT id, fileName, filePath, fileType FROM Files WHERE postId = ?', (post_id,))
    post['files'] = [dict(r) for r in cursor.fetchall()]
    cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM Likes WHERE postId = ? GROUP BY reactionType', (post_id,))
    post['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    for r in cursor.fetchall():
        t = (r['reactionType'] or 'heart').lower()
        if t in post['reactionCounts']:
            post['reactionCounts'][t] = r['cnt']
    post['likesCount'] = sum(post['reactionCounts'].values())
    cursor.execute('SELECT COUNT(*) as c FROM Comments WHERE postId = ?', (post_id,))
    post['commentsCount'] = cursor.fetchone()['c']
    cursor.execute('SELECT COUNT(*) as c FROM Reposts WHERE originalPostId = ?', (post_id,))
    post['repostsCount'] = cursor.fetchone()['c']
    current_user_id = get_current_user_id()
    if current_user_id:
        cursor.execute('SELECT reactionType FROM Likes WHERE postId = ? AND userId = ?', (post_id, current_user_id))
        r = cursor.fetchone()
        post['liked'] = r is not None
        post['currentUserReaction'] = (r['reactionType'] or 'heart').lower() if r else None
        cursor.execute('SELECT id FROM Reposts WHERE originalPostId = ? AND userId = ?', (post_id, current_user_id))
        post['reposted'] = cursor.fetchone() is not None
    else:
        post['liked'] = False
        post['currentUserReaction'] = None
        post['reposted'] = False
    conn.close()
    return jsonify({'success': True, 'post': post})


@app.route('/api/posts/<int:post_id>', methods=['DELETE'])
def delete_post(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT userId FROM Posts WHERE id = ?', (post_id,))
    post = cursor.fetchone()
    
    if not post:
        conn.close()
        return jsonify({'success': False, 'message': 'Post not found'}), 404
    
    if post['userId'] != user_id:
        conn.close()
        return jsonify({'success': False, 'message': 'No permission to delete'}), 403
    
    cursor.execute('SELECT filePath FROM Files WHERE postId = ?', (post_id,))
    files = cursor.fetchall()
    for file_row in files:
        delete_file(file_row['filePath'])
    
    cursor.execute('DELETE FROM Posts WHERE id = ?', (post_id,))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Post deleted'})


@app.route('/api/posts/<int:post_id>/like', methods=['POST'])
def toggle_like(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    data = (request.get_json() or {})
    reaction_type = (data.get('reactionType') or 'heart').strip().lower()
    if reaction_type not in ('heart', 'fire', 'laugh', 'wow'):
        reaction_type = 'heart'

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Post not found'}), 404

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
    conn = get_db_connection()
    cursor = conn.cursor()
    sort = (request.args.get('sort') or 'latest').strip().lower()
    if sort != 'hot':
        sort = 'latest'
    limit = min(100, max(1, int(request.args.get('limit', 50))))
    offset = max(0, int(request.args.get('offset', 0)))
    order_sql = 'ORDER BY c.createdAt DESC' if sort == 'latest' else '''ORDER BY (
        SELECT COUNT(*) FROM CommentLikes cl WHERE cl.commentId = c.id
    ) DESC, c.createdAt DESC'''
    cursor.execute('SELECT COUNT(*) as total FROM Comments WHERE postId = ?', (post_id,))
    total_count = cursor.fetchone()['total']
    cursor.execute('''
        SELECT c.id, c.postId, c.userId, c.content, c.createdAt, c.isAnonymous,
               u.username, u.avatar
        FROM Comments c
        JOIN Users u ON c.userId = u.id
        WHERE c.postId = ?
        ''' + order_sql + '''
        LIMIT ? OFFSET ?
    ''', (post_id, limit, offset))
    comments = []
    current_user_id = get_current_user_id()
    for row in cursor.fetchall():
        comment = dict(row)
        comment['isAnonymous'] = bool(comment.get('isAnonymous', 0))
        if comment['isAnonymous']:
            comment['username'] = 'Anonymous'
            comment['avatar'] = None
            comment['anonymousColor'] = get_anonymous_color(comment['id'])
        else:
            comment['anonymousColor'] = None
        cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM CommentLikes WHERE commentId = ? GROUP BY reactionType', (comment['id'],))
        comment['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
        for r in cursor.fetchall():
            t = (r['reactionType'] or 'heart').lower()
            if t in comment['reactionCounts']:
                comment['reactionCounts'][t] = r['cnt']
        comment['currentUserReaction'] = None
        if current_user_id:
            cursor.execute('SELECT reactionType FROM CommentLikes WHERE commentId = ? AND userId = ?', (comment['id'], current_user_id))
            r = cursor.fetchone()
            if r:
                comment['currentUserReaction'] = (r['reactionType'] or 'heart').lower()
        comments.append(comment)
    conn.close()
    return jsonify({'success': True, 'comments': comments, 'totalCount': total_count})


@app.route('/api/posts/<int:post_id>/comments', methods=['POST'])
def create_comment(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    data = request.get_json()
    content = data.get('content', '').strip()
    anonymous = data.get('anonymous', False) in (True, 'true', 1, '1')

    if not content:
        return jsonify({'success': False, 'message': 'Comment cannot be empty'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Post not found'}), 404
    
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Comments (postId, userId, content, createdAt, isAnonymous)
        VALUES (?, ?, ?, ?, ?)
    ''', (post_id, user_id, content, created_at, 1 if anonymous else 0))
    
    comment_id = cursor.lastrowid
    
    cursor.execute('''
        SELECT c.id, c.postId, c.userId, c.content, c.createdAt, c.isAnonymous,
               u.username, u.avatar
        FROM Comments c
        JOIN Users u ON c.userId = u.id
        WHERE c.id = ?
    ''', (comment_id,))
    
    comment = dict(cursor.fetchone())
    comment['isAnonymous'] = bool(comment.get('isAnonymous', 0))
    if comment['isAnonymous']:
        comment['username'] = 'Anonymous'
        comment['avatar'] = None
        comment['anonymousColor'] = get_anonymous_color(comment['id'])
    else:
        comment['anonymousColor'] = None
    comment['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    comment['currentUserReaction'] = None
    
    cursor.execute('''
        UPDATE Posts
        SET attentionSum = attentionSum + ?, viewsCount = viewsCount + 1
        WHERE id = ?
    ''', (12, post_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Comment added',
        'comment': comment
    }), 201


@app.route('/api/comments/<int:comment_id>/like', methods=['POST'])
def toggle_comment_like(comment_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    data = (request.get_json() or {})
    reaction_type = (data.get('reactionType') or 'heart').strip().lower()
    if reaction_type not in ('heart', 'fire', 'laugh', 'wow'):
        reaction_type = 'heart'

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM Comments WHERE id = ?', (comment_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Comment not found'}), 404

    cursor.execute('SELECT id, reactionType FROM CommentLikes WHERE commentId = ? AND userId = ?', (comment_id, user_id))
    like = cursor.fetchone()
    created_at = datetime.now().isoformat()

    if like:
        old_type = (like['reactionType'] or 'heart').lower()
        if old_type == reaction_type:
            cursor.execute('DELETE FROM CommentLikes WHERE commentId = ? AND userId = ?', (comment_id, user_id))
            liked = False
            current_reaction = None
        else:
            cursor.execute('UPDATE CommentLikes SET reactionType = ? WHERE commentId = ? AND userId = ?', (reaction_type, comment_id, user_id))
            liked = True
            current_reaction = reaction_type
    else:
        cursor.execute('''
            INSERT INTO CommentLikes (commentId, userId, reactionType, createdAt)
            VALUES (?, ?, ?, ?)
        ''', (comment_id, user_id, reaction_type, created_at))
        liked = True
        current_reaction = reaction_type

    cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM CommentLikes WHERE commentId = ? GROUP BY reactionType', (comment_id,))
    counts = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    for row in cursor.fetchall():
        t = (row['reactionType'] or 'heart').lower()
        if t in counts:
            counts[t] = row['cnt']
    if not liked:
        cursor.execute('SELECT reactionType FROM CommentLikes WHERE commentId = ? AND userId = ?', (comment_id, user_id))
        r = cursor.fetchone()
        current_reaction = (r['reactionType'] or 'heart').lower() if r else None

    conn.commit()
    conn.close()
    return jsonify({
        'success': True,
        'liked': liked,
        'reactionCounts': counts,
        'currentUserReaction': current_reaction
    })


@app.route('/api/comments/<int:comment_id>', methods=['PUT', 'PATCH'])
def update_comment(comment_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    data = request.get_json()
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'success': False, 'message': 'Comment cannot be empty'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, userId, content FROM Comments WHERE id = ?', (comment_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Comment not found'}), 404
    if row['userId'] != user_id:
        conn.close()
        return jsonify({'success': False, 'message': 'Cannot edit another user\'s comment'}), 403

    cursor.execute('UPDATE Comments SET content = ? WHERE id = ?', (content, comment_id))
    cursor.execute('''
        SELECT c.id, c.postId, c.userId, c.content, c.createdAt,
               u.username, u.avatar
        FROM Comments c
        JOIN Users u ON c.userId = u.id
        WHERE c.id = ?
    ''', (comment_id,))
    comment = dict(cursor.fetchone())
    cursor.execute('SELECT reactionType, COUNT(*) as cnt FROM CommentLikes WHERE commentId = ? GROUP BY reactionType', (comment_id,))
    comment['reactionCounts'] = {'heart': 0, 'fire': 0, 'laugh': 0, 'wow': 0}
    for r in cursor.fetchall():
        t = (r['reactionType'] or 'heart').lower()
        if t in comment['reactionCounts']:
            comment['reactionCounts'][t] = r['cnt']
    comment['currentUserReaction'] = None
    cursor.execute('SELECT reactionType FROM CommentLikes WHERE commentId = ? AND userId = ?', (comment_id, user_id))
    r = cursor.fetchone()
    if r:
        comment['currentUserReaction'] = (r['reactionType'] or 'heart').lower()
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'comment': comment})


@app.route('/api/comments/<int:comment_id>', methods=['DELETE'])
def delete_comment(comment_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, userId, postId FROM Comments WHERE id = ?', (comment_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Comment not found'}), 404
    if row['userId'] != user_id:
        conn.close()
        return jsonify({'success': False, 'message': 'Cannot delete another user\'s comment'}), 403

    cursor.execute('DELETE FROM CommentLikes WHERE commentId = ?', (comment_id,))
    cursor.execute('DELETE FROM Comments WHERE id = ?', (comment_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'message': 'Comment deleted', 'postId': row['postId']})


@app.route('/api/posts/<int:post_id>/repost', methods=['POST'])
def create_repost(post_id):
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Posts WHERE id = ?', (post_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Post not found'}), 404
    
    cursor.execute('SELECT id FROM Reposts WHERE originalPostId = ? AND userId = ?', (post_id, user_id))
    existing = cursor.fetchone()
    if existing:
        cursor.execute('DELETE FROM Reposts WHERE originalPostId = ? AND userId = ?', (post_id, user_id))
        conn.commit()
        cursor.execute('SELECT COUNT(*) as count FROM Reposts WHERE originalPostId = ?', (post_id,))
        count = cursor.fetchone()['count']
        conn.close()
        return jsonify({
            'success': True,
            'message': 'Repost cancelled',
            'reposted': False,
            'repostsCount': count
        })
    
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO Reposts (originalPostId, userId, createdAt)
        VALUES (?, ?, ?)
    ''', (post_id, user_id, created_at))
    
    repost_id = cursor.lastrowid
    
    cursor.execute('''
        UPDATE Posts
        SET attentionSum = attentionSum + ?, viewsCount = viewsCount + 1
        WHERE id = ?
    ''', (8, post_id))
    
    conn.commit()
    cursor.execute('SELECT COUNT(*) as count FROM Reposts WHERE originalPostId = ?', (post_id,))
    count = cursor.fetchone()['count']
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Repost created',
        'reposted': True,
        'repost': {'id': repost_id, 'originalPostId': post_id, 'userId': user_id, 'createdAt': created_at},
        'repostsCount': count
    })


@app.route('/api/follow/<int:user_id>', methods=['POST'])
def follow_user(user_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    if current_user_id == user_id:
        return jsonify({'success': False, 'message': 'Cannot follow yourself'}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM Users WHERE id = ?', (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
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
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(current_user_id)

    try:
        other_id = int(request.args.get('withUser', ''))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'withUser is required'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE id = ?', (other_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'User not found'}), 404

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
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(from_user_id)

    data = request.get_json() or {}
    to_user_id = data.get('toUserId')
    content = (data.get('content') or '').strip()

    try:
        to_user_id = int(to_user_id)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Invalid recipient'}), 400

    if not content:
        return jsonify({'success': False, 'message': 'Message cannot be empty'}), 400

    if to_user_id == from_user_id:
        return jsonify({'success': False, 'message': 'Cannot message yourself'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT id FROM Users WHERE id = ?', (to_user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'User not found'}), 404

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
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(current_user_id)

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
        SELECT id, username, email, bio, avatar, createdAt, lastActive
        FROM Users
        WHERE id IN ({ph})
    ''', partner_ids)
    users = [dict(row) for row in cursor.fetchall()]
    for u in users:
        cursor.execute('''
            SELECT id, content, fromUserId, createdAt FROM Messages
            WHERE (fromUserId = ? AND toUserId = ?) OR (fromUserId = ? AND toUserId = ?)
            ORDER BY createdAt DESC LIMIT 1
        ''', (current_user_id, u['id'], u['id'], current_user_id))
        r = cursor.fetchone()
        if r:
            u['lastMessageAt'] = r['createdAt']
            u['lastMessageContent'] = r['content']
            u['lastMessageFromUserId'] = r['fromUserId']
            u['lastMessageId'] = r['id']
        else:
            u['lastMessageAt'] = None
            u['lastMessageContent'] = None
            u['lastMessageFromUserId'] = None
            u['lastMessageId'] = None
    users.sort(key=lambda x: (x.get('lastMessageAt') or ''), reverse=True)
    conn.close()
    return jsonify({'success': True, 'users': users})


# --- Мессенджер: комнаты (треды/группы) ---
# Хранилище "typing" в памяти: room_id -> { user_id: timestamp }
_room_typing = {}


def _room_expired(expires_at):
    if not expires_at:
        return False
    try:
        return datetime.fromisoformat(expires_at) < datetime.now()
    except Exception:
        return False


def _ensure_room_member(cursor, room_id, user_id):
    cursor.execute('SELECT 1 FROM ChatRoomMember WHERE roomId = ? AND userId = ?', (room_id, user_id))
    return cursor.fetchone() is not None


def _is_room_admin(cursor, room_id, user_id):
    cursor.execute('SELECT 1 FROM ChatRoom WHERE id = ? AND createdById = ?', (room_id, user_id))
    if cursor.fetchone():
        return True
    cursor.execute('SELECT 1 FROM ChatRoomAdmin WHERE roomId = ? AND userId = ?', (room_id, user_id))
    return cursor.fetchone() is not None


def _is_user_muted(cursor, room_id, user_id):
    cursor.execute('SELECT mutedUntil FROM ChatRoomMute WHERE roomId = ? AND userId = ?', (room_id, user_id))
    row = cursor.fetchone()
    if not row:
        return False
    try:
        return datetime.fromisoformat(row['mutedUntil']) > datetime.now()
    except Exception:
        return False


@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(current_user_id)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.id, r.title, r.type, r.isAnonymous, r.expiresAt, r.isPublic, r.createdById, r.createdAt
        FROM ChatRoom r
        JOIN ChatRoomMember m ON m.roomId = r.id
        WHERE m.userId = ?
    ''', (current_user_id,))
    rooms = [dict(row) for row in cursor.fetchall()]
    now = datetime.now().isoformat()
    result = []
    for r in rooms:
        if _room_expired(r.get('expiresAt')):
            continue
        room_id = r['id']
        cursor.execute('''
            SELECT m.id, m.content, m.fromUserId, m.createdAt, m.isAnonymous
            FROM RoomMessage m
            WHERE m.roomId = ?
            ORDER BY m.createdAt DESC LIMIT 1
        ''', (room_id,))
        last = cursor.fetchone()
        if last:
            r['lastMessageAt'] = last['createdAt']
            r['lastMessageContent'] = last['content']
            r['lastMessageFromUserId'] = last['fromUserId']
            r['lastMessageId'] = last['id']
        else:
            r['lastMessageAt'] = r['createdAt']
            r['lastMessageContent'] = None
            r['lastMessageFromUserId'] = None
            r['lastMessageId'] = None
        cursor.execute('SELECT COUNT(*) AS c FROM RoomMessage WHERE roomId = ?', (room_id,))
        r['messageCount'] = cursor.fetchone()['c']
        cursor.execute('SELECT COUNT(DISTINCT userId) AS c FROM ChatRoomMember WHERE roomId = ?', (room_id,))
        r['memberCount'] = cursor.fetchone()['c']
        if r.get('type') == 'dm' and r['memberCount'] == 2:
            cursor.execute('SELECT userId FROM ChatRoomMember WHERE roomId = ? AND userId != ?', (room_id, current_user_id))
            other = cursor.fetchone()
            if other:
                cursor.execute('SELECT username FROM Users WHERE id = ?', (other['userId'],))
                u = cursor.fetchone()
                if u:
                    r['title'] = u['username']
        result.append(r)
    conn.close()
    result.sort(key=lambda x: (x.get('lastMessageAt') or ''), reverse=True)
    return jsonify({'success': True, 'rooms': result})


@app.route('/api/rooms', methods=['POST'])
def create_room():
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(current_user_id)

    data = request.get_json() or {}
    title = (data.get('title') or '').strip() or None
    room_type = data.get('type') or 'group'
    is_anonymous = 1 if data.get('isAnonymous') else 0
    expires_in_days = data.get('expiresInDays')
    is_public = 1 if data.get('isPublic', True) else 0
    member_ids = data.get('memberIds') or []

    # DM: если уже есть комната с теми же двумя участниками — вернуть её
    if room_type == 'dm' and len(member_ids) == 1:
        other_id = None
        try:
            other_id = int(member_ids[0])
        except (TypeError, ValueError):
            pass
        if other_id and other_id != current_user_id:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                SELECT r.id FROM ChatRoom r
                JOIN ChatRoomMember m1 ON m1.roomId = r.id AND m1.userId = ?
                JOIN ChatRoomMember m2 ON m2.roomId = r.id AND m2.userId = ?
                WHERE r.type = 'dm'
            ''', (current_user_id, other_id))
            row = cursor.fetchone()
            if row:
                room_id = row['id']
                cursor.execute('SELECT id, title, type, isAnonymous, expiresAt, isPublic, createdById, createdAt FROM ChatRoom WHERE id = ?', (room_id,))
                room = dict(cursor.fetchone())
                cursor.execute('SELECT COUNT(*) AS c FROM RoomMessage WHERE roomId = ?', (room_id,))
                room['messageCount'] = cursor.fetchone()['c']
                cursor.execute('SELECT COUNT(*) AS c FROM ChatRoomMember WHERE roomId = ?', (room_id,))
                room['memberCount'] = cursor.fetchone()['c']
                cursor.execute('SELECT id, content, fromUserId, createdAt FROM RoomMessage WHERE roomId = ? ORDER BY createdAt DESC LIMIT 1', (room_id,))
                last = cursor.fetchone()
                room['lastMessageAt'] = last['createdAt'] if last else room['createdAt']
                room['lastMessageContent'] = last['content'] if last else None
                room['lastMessageFromUserId'] = last['fromUserId'] if last else None
                room['lastMessageId'] = last['id'] if last else None
                conn.close()
                return jsonify({'success': True, 'room': room})
            conn.close()

    expires_at = None
    if expires_in_days is not None:
        try:
            from datetime import timedelta
            expires_at = (datetime.now() + timedelta(days=int(expires_in_days))).isoformat()
        except (TypeError, ValueError):
            pass

    conn = get_db_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO ChatRoom (title, type, isAnonymous, expiresAt, isPublic, createdById, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (title, room_type, is_anonymous, expires_at, is_public, current_user_id, created_at))
    room_id = cursor.lastrowid
    cursor.execute('INSERT INTO ChatRoomMember (roomId, userId, joinedAt) VALUES (?, ?, ?)',
                   (room_id, current_user_id, created_at))
    cursor.execute('INSERT OR IGNORE INTO ChatRoomAdmin (roomId, userId) VALUES (?, ?)', (room_id, current_user_id))
    for uid in member_ids:
        try:
            uid = int(uid)
            if uid != current_user_id:
                cursor.execute('INSERT OR IGNORE INTO ChatRoomMember (roomId, userId, joinedAt) VALUES (?, ?, ?)',
                               (room_id, uid, created_at))
        except (TypeError, ValueError):
            pass
    conn.commit()

    cursor.execute('SELECT id, title, type, isAnonymous, expiresAt, isPublic, createdById, createdAt FROM ChatRoom WHERE id = ?', (room_id,))
    room = dict(cursor.fetchone())
    room['lastMessageAt'] = created_at
    room['lastMessageContent'] = None
    room['messageCount'] = 0
    room['memberCount'] = len(member_ids) + 1
    conn.close()
    return jsonify({'success': True, 'room': room})


@app.route('/api/rooms/<int:room_id>', methods=['GET'])
def get_room(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, title, type, isAnonymous, expiresAt, isPublic, createdById, createdAt FROM ChatRoom WHERE id = ?', (room_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    room = dict(row)
    if _room_expired(room.get('expiresAt')):
        conn.close()
        return jsonify({'success': False, 'message': 'Chat expired'}), 410
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    cursor.execute('SELECT COUNT(*) AS c FROM RoomMessage WHERE roomId = ?', (room_id,))
    room['messageCount'] = cursor.fetchone()['c']
    cursor.execute('SELECT userId FROM ChatRoomMember WHERE roomId = ?', (room_id,))
    room['memberIds'] = [r['userId'] for r in cursor.fetchall()]
    conn.close()
    return jsonify({'success': True, 'room': room})


@app.route('/api/rooms/<int:room_id>/messages', methods=['GET'])
def get_room_messages(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    limit = min(int(request.args.get('limit', 50)), 100)
    offset = int(request.args.get('offset', 0))
    after_id = request.args.get('afterId', type=int)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT 1 FROM ChatRoom WHERE id = ?', (room_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403

    if after_id:
        cursor.execute('''
            SELECT m.id, m.roomId, m.fromUserId, m.content, m.isAnonymous, m.replyToId, m.createdAt
            FROM RoomMessage m
            WHERE m.roomId = ? AND m.id > ?
            ORDER BY m.createdAt ASC
            LIMIT ?
        ''', (room_id, after_id, limit))
        rows = [dict(r) for r in cursor.fetchall()]
    else:
        cursor.execute('''
            SELECT m.id, m.roomId, m.fromUserId, m.content, m.isAnonymous, m.replyToId, m.createdAt
            FROM RoomMessage m
            WHERE m.roomId = ?
            ORDER BY m.createdAt DESC
            LIMIT ? OFFSET ?
        ''', (room_id, limit, offset))
        rows = list(reversed([dict(r) for r in cursor.fetchall()]))

    messages = []
    for msg in rows:
        cursor.execute('SELECT emoji, userId FROM RoomMessageReaction WHERE messageId = ?', (msg['id'],))
        msg['reactions'] = [{'emoji': r['emoji'], 'userId': r['userId']} for r in cursor.fetchall()]
        if msg.get('replyToId'):
            cursor.execute('SELECT id, content, fromUserId, isAnonymous FROM RoomMessage WHERE id = ?', (msg['replyToId'],))
            reply_row = cursor.fetchone()
            if reply_row:
                msg['replyTo'] = dict(reply_row)
        if not msg.get('isAnonymous'):
            cursor.execute('SELECT username, avatar FROM Users WHERE id = ?', (msg['fromUserId'],))
            u = cursor.fetchone()
            if u:
                msg['fromUsername'] = u['username']
                msg['fromAvatar'] = u['avatar']
        else:
            msg['anonymousColor'] = get_anonymous_color(msg['fromUserId'])
        messages.append(msg)

    conn.close()
    return jsonify({'success': True, 'messages': messages})


@app.route('/api/rooms/<int:room_id>/messages', methods=['POST'])
def send_room_message(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    update_user_last_active(current_user_id)

    data = request.get_json() or {}
    content = (data.get('content') or '').strip()
    is_anonymous = 1 if data.get('isAnonymous') else 0
    reply_to_id = data.get('replyToId', type=int)

    if not content:
        return jsonify({'success': False, 'message': 'Message cannot be empty'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, expiresAt FROM ChatRoom WHERE id = ?', (room_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    if _room_expired(row['expiresAt']):
        conn.close()
        return jsonify({'success': False, 'message': 'Chat expired'}), 410
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403

    if _is_user_muted(cursor, room_id, current_user_id):
        conn.close()
        cursor.execute('SELECT mutedUntil FROM ChatRoomMute WHERE roomId = ? AND userId = ?', (room_id, current_user_id))
        r = cursor.fetchone()
        return jsonify({'success': False, 'message': 'You are muted', 'mutedUntil': r['mutedUntil'] if r else None}), 403

    created_at = datetime.now().isoformat()
    cursor.execute('''
        INSERT INTO RoomMessage (roomId, fromUserId, content, isAnonymous, replyToId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (room_id, current_user_id, content, is_anonymous, reply_to_id or None, created_at))
    msg_id = cursor.lastrowid
    conn.commit()

    msg = dict(cursor.execute('SELECT id, roomId, fromUserId, content, isAnonymous, replyToId, createdAt FROM RoomMessage WHERE id = ?', (msg_id,)).fetchone())
    cursor.execute('SELECT emoji, userId FROM RoomMessageReaction WHERE messageId = ?', (msg_id,))
    msg['reactions'] = [{'emoji': r['emoji'], 'userId': r['userId']} for r in cursor.fetchall()]
    if msg.get('replyToId'):
        cursor.execute('SELECT id, content, fromUserId, isAnonymous FROM RoomMessage WHERE id = ?', (msg['replyToId'],))
        reply_row = cursor.fetchone()
        if reply_row:
            msg['replyTo'] = dict(reply_row)
    if not msg.get('isAnonymous'):
        cursor.execute('SELECT username, avatar FROM Users WHERE id = ?', (current_user_id,))
        u = cursor.fetchone()
        if u:
            msg['fromUsername'] = u['username']
            msg['fromAvatar'] = u['avatar']
    else:
        msg['anonymousColor'] = get_anonymous_color(current_user_id)
    conn.close()
    return jsonify({'success': True, 'message': msg})


@app.route('/api/rooms/<int:room_id>/messages/<int:message_id>/reaction', methods=['POST'])
def toggle_room_message_reaction(room_id, message_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401

    data = request.get_json() or {}
    emoji = (data.get('emoji') or 'heart').strip()[:20]

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM RoomMessage WHERE id = ? AND roomId = ?', (message_id, room_id))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Message not found'}), 404
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403

    cursor.execute('SELECT 1 FROM RoomMessageReaction WHERE messageId = ? AND userId = ?', (message_id, current_user_id))
    exists = cursor.fetchone()
    created_at = datetime.now().isoformat()
    if exists:
        cursor.execute('DELETE FROM RoomMessageReaction WHERE messageId = ? AND userId = ?', (message_id, current_user_id))
    else:
        cursor.execute('INSERT INTO RoomMessageReaction (messageId, userId, emoji, createdAt) VALUES (?, ?, ?, ?)',
                      (message_id, current_user_id, emoji, created_at))
    conn.commit()
    cursor.execute('SELECT emoji, userId FROM RoomMessageReaction WHERE messageId = ?', (message_id,))
    reactions = [{'emoji': r['emoji'], 'userId': r['userId']} for r in cursor.fetchall()]
    conn.close()
    return jsonify({'success': True, 'reactions': reactions})


@app.route('/api/rooms/<int:room_id>/typing', methods=['GET'])
def get_room_typing(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    # Проверка доступа к комнате через БД
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT 1 FROM ChatRoom WHERE id = ?', (room_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    conn.close()

    now_ts = datetime.now().timestamp()
    out = []
    if room_id in _room_typing:
        for uid, ts in list(_room_typing[room_id].items()):
            if uid != current_user_id and (now_ts - ts) < 5:
                out.append(uid)
            elif (now_ts - ts) >= 5:
                del _room_typing[room_id][uid]
    return jsonify({'success': True, 'typingUserIds': out})


@app.route('/api/rooms/<int:room_id>/typing', methods=['POST'])
def set_room_typing(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    data = request.get_json() or {}
    active = data.get('active', True)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT 1 FROM ChatRoom WHERE id = ?', (room_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    conn.close()
    if room_id not in _room_typing:
        _room_typing[room_id] = {}
    if active:
        _room_typing[room_id][current_user_id] = datetime.now().timestamp()
    else:
        _room_typing[room_id].pop(current_user_id, None)
    return jsonify({'success': True})


@app.route('/api/rooms/<int:room_id>/join', methods=['POST'])
def join_room(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT id, isPublic, expiresAt FROM ChatRoom WHERE id = ?', (room_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    if not row['isPublic']:
        conn.close()
        return jsonify({'success': False, 'message': 'Room is private'}), 403
    if _room_expired(row.get('expiresAt')):
        conn.close()
        return jsonify({'success': False, 'message': 'Chat expired'}), 410
    created_at = datetime.now().isoformat()
    cursor.execute('INSERT OR IGNORE INTO ChatRoomMember (roomId, userId, joinedAt) VALUES (?, ?, ?)',
                   (room_id, current_user_id, created_at))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/rooms/<int:room_id>/mute-status', methods=['GET'])
def get_room_mute_status(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    muted = _is_user_muted(cursor, room_id, current_user_id)
    muted_until = None
    if muted:
        cursor.execute('SELECT mutedUntil FROM ChatRoomMute WHERE roomId = ? AND userId = ?', (room_id, current_user_id))
        r = cursor.fetchone()
        if r:
            muted_until = r['mutedUntil']
    conn.close()
    return jsonify({'success': True, 'muted': muted, 'mutedUntil': muted_until})


@app.route('/api/rooms/<int:room_id>/mute', methods=['POST'])
def mute_room_user(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    data = request.get_json() or {}
    target_user_id = data.get('userId', type=int)
    minutes = data.get('minutes', 60)
    if not target_user_id:
        return jsonify({'success': False, 'message': 'Specify userId'}), 400
    try:
        minutes = min(max(int(minutes), 1), 10080)  # 1 min to 7 days
    except (TypeError, ValueError):
        minutes = 60
    conn = get_db_connection()
    cursor = conn.cursor()
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    if not _is_room_admin(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Only admin or creator can mute'}), 403
    if not _ensure_room_member(cursor, room_id, target_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'User is not in the room'}), 400
    from datetime import timedelta
    muted_until = (datetime.now() + timedelta(minutes=minutes)).isoformat()
    created_at = datetime.now().isoformat()
    cursor.execute('INSERT OR REPLACE INTO ChatRoomMute (roomId, userId, mutedUntil, mutedById, createdAt) VALUES (?, ?, ?, ?, ?)',
                   (room_id, target_user_id, muted_until, current_user_id, created_at))
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'mutedUntil': muted_until})


@app.route('/api/rooms/<int:room_id>/members', methods=['GET'])
def get_room_members(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    cursor.execute('''
        SELECT m.userId, u.username, u.avatar, m.joinedAt,
               (r.createdById = m.userId OR a.userId IS NOT NULL) AS isAdmin
        FROM ChatRoomMember m
        JOIN Users u ON u.id = m.userId
        LEFT JOIN ChatRoom r ON r.id = m.roomId
        LEFT JOIN ChatRoomAdmin a ON a.roomId = m.roomId AND a.userId = m.userId
        WHERE m.roomId = ?
    ''', (room_id,))
    members = [dict(r) for r in cursor.fetchall()]
    for m in members:
        m['isAdmin'] = bool(m.get('isAdmin'))
    conn.close()
    return jsonify({'success': True, 'members': members})


@app.route('/api/rooms/<int:room_id>/members', methods=['POST'])
def add_room_members(room_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    data = request.get_json() or {}
    user_ids = data.get('userIds') or []
    if not user_ids:
        return jsonify({'success': False, 'message': 'Specify userIds'}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    if not _is_room_admin(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Only admin or creator can add members'}), 403
    cursor.execute('SELECT 1 FROM ChatRoom WHERE id = ?', (room_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'message': 'Room not found'}), 404
    created_at = datetime.now().isoformat()
    added = 0
    for uid in user_ids:
        try:
            uid = int(uid)
            if uid != current_user_id:
                cursor.execute('INSERT OR IGNORE INTO ChatRoomMember (roomId, userId, joinedAt) VALUES (?, ?, ?)',
                               (room_id, uid, created_at))
                if cursor.rowcount > 0:
                    added += 1
        except (TypeError, ValueError):
            pass
    conn.commit()
    conn.close()
    return jsonify({'success': True, 'added': added})


@app.route('/api/rooms/<int:room_id>/members/<int:target_user_id>', methods=['DELETE'])
def remove_room_member(room_id, target_user_id):
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    if not _ensure_room_member(cursor, room_id, current_user_id):
        conn.close()
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    can_remove = _is_room_admin(cursor, room_id, current_user_id) or target_user_id == current_user_id
    if not can_remove:
        conn.close()
        return jsonify({'success': False, 'message': 'No permission to delete'}), 403
    cursor.execute('DELETE FROM ChatRoomMember WHERE roomId = ? AND userId = ?', (room_id, target_user_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/stats', methods=['GET'])
def get_network_stats():
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
    
    story_score = likes_received + comments_received + reposts_received
    
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
            'storyScore': story_score,
            'averageAttention': avg_attention_seconds
        }
    })


@app.route('/api/recommendations/users', methods=['GET'])
def get_user_recommendations():
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    def _w(name: str, default: float) -> float:
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

    # exclude users we already follow (and self)
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

    cursor.execute(f'''
        SELECT followingId as userId, COUNT(*) as cnt
        FROM Followers
        WHERE followingId IN ({cph})
        GROUP BY followingId
    ''', candidate_ids)
    followers_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

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

    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Likes l
        JOIN Posts p ON l.postId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    likes_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Comments c
        JOIN Posts p ON c.postId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    comments_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    cursor.execute(f'''
        SELECT p.userId as userId, COUNT(*) as cnt
        FROM Reposts r
        JOIN Posts p ON r.originalPostId = p.id
        WHERE p.userId IN ({cph})
        GROUP BY p.userId
    ''', candidate_ids)
    reposts_map = {row['userId']: row['cnt'] for row in cursor.fetchall()}

    # how many users both current_user and candidate follow
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
    current_user_id = require_auth()
    if not current_user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
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
    author_affinity_weight = _w('authorAffinityWeight', 1.0)
    thread_activity_weight = _w('threadActivityWeight', 1.5)
    anonymity_interest_weight = _w('anonymityInterestWeight', 0.5)
    trendiness_weight = _w('trendinessWeight', 1.0)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT followingId FROM Followers WHERE followerId = ?', (current_user_id,))
    following_ids = {row['followingId'] for row in cursor.fetchall()}

    # base set of posts, limit 200 for sqlite perf
    cursor.execute('''
        SELECT p.id, p.userId, p.content, p.mood, p.createdAt, p.attentionSum, p.viewsCount, COALESCE(p.isAnonymous, 0) as isAnonymous,
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
        author_affinity = 1.0 if (post.get('userId') in following_ids) else 0.0
        thread_activity = float(post.get('comments') or 0)
        anonymity_boost = 1.0 if post.get('isAnonymous') else 0.0
        trendiness = (float(post.get('likes') or 0) + float(post.get('comments') or 0)) / (1.0 + hours_since_post)

        score = (
            base_score + freshness_score
            + author_affinity_weight * author_affinity
            + thread_activity_weight * thread_activity
            + anonymity_interest_weight * anonymity_boost
            + trendiness_weight * trendiness
        )

        post['averageAttentionSeconds'] = average_attention_seconds
        post['hoursSincePost'] = hours_since_post
        scored.append({'post': post, 'score': score})

    scored.sort(key=lambda x: x['score'], reverse=True)
    top_posts = [item['post'] for item in scored[:20]]

    # enrich with files, reaction counts, liked/reposted for current user
    for post in top_posts:
        post.setdefault('mood', 'happy')
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
        post['isAnonymous'] = bool(post.get('isAnonymous', 0))
        post['anonymousColor'] = get_anonymous_color(post_id) if post['isAnonymous'] else None
        post.pop('likes', None)
        post.pop('comments', None)
        post.pop('reposts', None)

    conn.close()
    return jsonify({'success': True, 'posts': top_posts})


@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    user_id = require_auth()
    if not user_id:
        return jsonify({'success': False, 'message': 'Authentication required'}), 401
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    bio = request.form.get('bio', '').strip()
    avatar_file = request.files.get('avatar')
    profile_gradient = (request.form.get('profileGradient') or '').strip() or None

    updates = []
    params = []

    if bio is not None:
        updates.append('bio = ?')
        params.append(bio)

    if profile_gradient is not None:
        updates.append('profileGradient = ?')
        params.append(profile_gradient)
    
    if avatar_file:
        file_info = save_file(avatar_file, user_id)
        if file_info:
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
    
    cursor.execute('''
        SELECT id, username, email, bio, avatar, createdAt, profileBackground, profileAccentColor, profileGradient
        FROM Users
        WHERE id = ?
    ''', (user_id,))
    
    user = dict(cursor.fetchone())
    conn.close()
    
    return jsonify({
        'success': True,
        'message': 'Profile updated',
        'user': user
    })


@app.route('/api/files/<path:filename>')
def serve_file(filename):
    # filename is like userId/unique_filename
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# serve frontend; these routes last so /api/ is not caught

@app.route('/')
def index():
    return send_from_directory(ROOT_DIR, 'index.html')


@app.route('/<path:path>')
def serve_static(path):
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
    if not os.path.exists('uploads'):
        os.makedirs('uploads')
    app.run(host='0.0.0.0', port=5000, debug=True)
