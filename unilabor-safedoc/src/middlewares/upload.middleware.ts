import fs from 'fs';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD || 'uploads/documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `SAFEDOC-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  },
});

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD_AVATAR || 'uploads/avatars';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req: any, file, cb) => {
    const userId = String(req.user?.id ?? 'USER');
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `AVATAR-${safeUserId}-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const allowedAvatarMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedAvatarMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP para el avatar'));
  },
});