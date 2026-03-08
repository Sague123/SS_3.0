"""
Модуль для работы с базой данных SQLite.
Содержит функции для инициализации БД и создания всех необходимых таблиц.
"""

import sqlite3
import os
from datetime import datetime

# Путь к файлу базы данных
DB_PATH = 'social_network.db'


def get_db_connection():
    """
    Создает и возвращает соединение с базой данных SQLite.
    
    Returns:
        sqlite3.Connection: Соединение с БД
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Возвращает результаты как словари
    return conn


def init_database():
    """
    Инициализирует базу данных: создает все необходимые таблицы,
    если они еще не существуют.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Таблица пользователей
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
    
    # Таблица постов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            content TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            attentionSum REAL DEFAULT 0,
            viewsCount INTEGER DEFAULT 0,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    # Таблица лайков
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            postId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            createdAt TEXT NOT NULL,
            UNIQUE(postId, userId),
            FOREIGN KEY (postId) REFERENCES Posts(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
    ''')
    
    # Таблица комментариев
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
    
    # Таблица репостов
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
    
    # Таблица подписок (followers)
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
    
    # Таблица файлов
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
    
    # Создаем индексы для улучшения производительности
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_posts_userId ON Posts(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_postId ON Likes(postId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_likes_userId ON Likes(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_comments_postId ON Comments(postId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reposts_originalPostId ON Reposts(originalPostId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reposts_userId ON Reposts(userId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_followers_followerId ON Followers(followerId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_followers_followingId ON Followers(followingId)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_files_postId ON Files(postId)')

    # Таблица сообщений
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
    
    conn.commit()
    conn.close()
    print("База данных успешно инициализирована!")


if __name__ == '__main__':
    # Если скрипт запускается напрямую, инициализируем БД
    init_database()
