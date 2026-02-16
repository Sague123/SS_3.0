"""
Модуль для работы с загруженными файлами.
Обрабатывает сохранение файлов на сервере и возвращает пути к ним.
"""

import os
import uuid
from werkzeug.utils import secure_filename
from datetime import datetime

# Папка для хранения загруженных файлов
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'doc', 'docx'}


def allowed_file(filename):
    """
    Проверяет, разрешен ли тип файла для загрузки.
    
    Args:
        filename (str): Имя файла
        
    Returns:
        bool: True если файл разрешен, False иначе
    """
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
    """
    Определяет тип файла по расширению.
    
    Args:
        filename (str): Имя файла
        
    Returns:
        str: Тип файла ('image', 'document', 'other')
    """
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    image_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if ext in image_extensions:
        return 'image'
    elif ext in {'pdf', 'txt', 'doc', 'docx'}:
        return 'document'
    return 'other'


def save_file(file, user_id, post_id=None):
    """
    Сохраняет загруженный файл на сервере.
    
    Args:
        file: Файл из request.files
        user_id (int): ID пользователя
        post_id (int, optional): ID поста, если файл прикреплен к посту
        
    Returns:
        dict: Словарь с информацией о файле {'fileName', 'filePath', 'fileType'}
              или None если файл не был сохранен
    """
    if not file or file.filename == '':
        return None
    
    if not allowed_file(file.filename):
        return None
    
    # Создаем папку для загрузок, если её нет
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    
    # Создаем подпапку для пользователя
    user_folder = os.path.join(UPLOAD_FOLDER, str(user_id))
    if not os.path.exists(user_folder):
        os.makedirs(user_folder)
    
    # Генерируем уникальное имя файла
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{filename}"
    file_path = os.path.join(user_folder, unique_filename)
    
    # Сохраняем файл
    file.save(file_path)
    
    # Определяем тип файла
    file_type = get_file_type(filename)
    
    return {
        'fileName': filename,
        'filePath': file_path,
        'fileType': file_type
    }


def delete_file(file_path):
    """
    Удаляет файл с сервера.
    
    Args:
        file_path (str): Путь к файлу
    """
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Ошибка при удалении файла {file_path}: {e}")
