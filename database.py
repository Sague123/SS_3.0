"""
SQLite DB: init and table creation.
"""

import sqlite3
import os
from datetime import datetime

DB_PATH = 'social_network.db'


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            passwordHash TEXT NOT NULL,
            bio TEXT DEFAULT '',
            avatar TEXT DEFAULT NULL,
            createdAt TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            content TEXT NOT NULL,
            mood TEXT DEFAULT 'happy',
            createdAt TEXT NOT NULL,
            attentionSum REAL DEFAULT 0,
            viewsCount INTEGER DEFAULT 0,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            reactionType TEXT DEFAULT 'heart',
            createdAt TEXT NOT NULL,
            UNIQUE(postId, userId),
            FOREIGN KEY (postId) REFERENCES Posts(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (postId) REFERENCES Posts(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS CommentLikes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commentId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            reactionType TEXT DEFAULT 'heart',
            createdAt TEXT NOT NULL,
            UNIQUE(commentId, userId),
            FOREIGN KEY (commentId) REFERENCES Comments(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Reposts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            originalPostId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (originalPostId) REFERENCES Posts(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Followers (
            followerId INTEGER NOT NULL,
            followingId INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            PRIMARY KEY (followerId, followingId),
            FOREIGN KEY (followerId) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (followingId) REFERENCES Users(id) ON DELETE CASCADE,
            CHECK (followerId != followingId)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            fileName TEXT NOT NULL,
            filePath TEXT NOT NULL,
            fileType TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (postId) REFERENCES Posts(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_posts_userId ON Posts(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_postId ON Likes(postId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_userId ON Likes(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_postId ON Comments(postId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comment_likes_commentId ON CommentLikes(commentId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comment_likes_userId ON CommentLikes(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reposts_originalPostId ON Reposts(originalPostId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reposts_userId ON Reposts(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_followers_followerId ON Followers(followerId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_followers_followingId ON Followers(followingId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_postId ON Files(postId)')

    # migration: add reactionType to Likes if table existed without it
    try:
        cursor.execute('SELECT reactionType FROM Likes LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Likes ADD COLUMN reactionType TEXT DEFAULT \'heart\'')
        conn.commit()

    try:
        cursor.execute('SELECT mood FROM Posts LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Posts ADD COLUMN mood TEXT DEFAULT \'happy\'')
        conn.commit()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fromUserId INTEGER NOT NULL,
            toUserId INTEGER NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (fromUserId) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (toUserId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_from_to ON Messages(fromUserId, toUserId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_to ON Messages(toUserId)')
    
    try:
        cursor.execute('SELECT lastActive FROM Users LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Users ADD COLUMN lastActive TEXT DEFAULT NULL')
        conn.commit()

    try:
        cursor.execute('SELECT profileBackground FROM Users LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Users ADD COLUMN profileBackground TEXT DEFAULT NULL')
        cursor.execute('ALTER TABLE Users ADD COLUMN profileAccentColor TEXT DEFAULT NULL')
        conn.commit()

    try:
        cursor.execute('SELECT profileGradient FROM Users LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Users ADD COLUMN profileGradient TEXT DEFAULT NULL')
        conn.commit()

    try:
        cursor.execute('SELECT isAnonymous FROM Posts LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Posts ADD COLUMN isAnonymous INTEGER DEFAULT 0')
        conn.commit()

    try:
        cursor.execute('SELECT isAnonymous FROM Comments LIMIT 1')
    except sqlite3.OperationalError:
        cursor.execute('ALTER TABLE Comments ADD COLUMN isAnonymous INTEGER DEFAULT 0')
        conn.commit()

    # Мессенджер: комнаты (треды/группы), участники, сообщения, реакции
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ChatRoom (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            type TEXT NOT NULL DEFAULT 'group',
            isAnonymous INTEGER DEFAULT 0,
            expiresAt TEXT,
            isPublic INTEGER DEFAULT 1,
            createdById INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (createdById) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ChatRoomMember (
            roomId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            joinedAt TEXT NOT NULL,
            PRIMARY KEY (roomId, userId),
            FOREIGN KEY (roomId) REFERENCES ChatRoom(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS RoomMessage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roomId INTEGER NOT NULL,
            fromUserId INTEGER NOT NULL,
            content TEXT NOT NULL,
            isAnonymous INTEGER DEFAULT 0,
            replyToId INTEGER,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (roomId) REFERENCES ChatRoom(id) ON DELETE CASCADE,
            FOREIGN KEY (fromUserId) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (replyToId) REFERENCES RoomMessage(id) ON DELETE SET NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS RoomMessageReaction (
            messageId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            emoji TEXT NOT NULL DEFAULT 'heart',
            createdAt TEXT NOT NULL,
            PRIMARY KEY (messageId, userId),
            FOREIGN KEY (messageId) REFERENCES RoomMessage(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_chatroom_created ON ChatRoom(createdAt)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roommember_room ON ChatRoomMember(roomId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roommember_user ON ChatRoomMember(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roommessage_room ON RoomMessage(roomId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roommessage_created ON RoomMessage(createdAt)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roomreaction_message ON RoomMessageReaction(messageId)')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ChatRoomAdmin (
            roomId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            PRIMARY KEY (roomId, userId),
            FOREIGN KEY (roomId) REFERENCES ChatRoom(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ChatRoomMute (
            roomId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            mutedUntil TEXT NOT NULL,
            mutedById INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            PRIMARY KEY (roomId, userId),
            FOREIGN KEY (roomId) REFERENCES ChatRoom(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (mutedById) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_roommute_room ON ChatRoomMute(roomId)')

    conn.commit()
    conn.close()
    print("База данных успешно инициализирована!")


if __name__ == '__main__':
    init_database()
