"""
Save/delete uploaded files; return paths. Used by posts and profile avatar.
"""

import os
import uuid
from werkzeug.utils import secure_filename
from datetime import datetime

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'doc', 'docx'}


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    image_extensions = {'png', 'jpg', 'jpeg', 'gif'}
    if ext in image_extensions:
        return 'image'
    elif ext in {'pdf', 'txt', 'doc', 'docx'}:
        return 'document'
    return 'other'


def save_file(file, user_id, post_id=None):
    if not file or file.filename == '':
        return None
    
    if not allowed_file(file.filename):
        return None
    
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    
    user_folder = os.path.join(UPLOAD_FOLDER, str(user_id))
    if not os.path.exists(user_folder):
        os.makedirs(user_folder)
    
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{filename}"
    file_path = os.path.join(user_folder, unique_filename)
    
    file.save(file_path)
    file_type = get_file_type(filename)
    
    return {
        'fileName': filename,
        'filePath': file_path,
        'fileType': file_type
    }


def delete_file(file_path):
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Error deleting {file_path}: {e}")
