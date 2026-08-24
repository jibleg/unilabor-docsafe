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
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  },
});

const providerDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD_PROVIDER_DOCUMENTS || 'uploads/provider-documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `PROVIDER-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

export const uploadProviderDocument = multer({
  storage: providerDocumentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  },
});

const clientDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD_CLIENT_DOCUMENTS || 'uploads/client-documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `CLIENT-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

export const uploadClientDocument = multer({
  storage: clientDocumentStorage,
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

// Evidencia de intervencion de tickets Helpdesk (foto de la reparacion,
// reporte de proveedor, refaccion usada): PDF o imagen, a diferencia del resto
// de `upload.middleware.ts` que es PDF-only.
const ticketDocumentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD_TICKET_DOCUMENTS || 'uploads/ticket-documents';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `TICKET-EVID-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const allowedTicketDocumentMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export const uploadTicketDocument = multer({
  storage: ticketDocumentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedTicketDocumentMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Solo se permiten archivos PDF o imagenes JPG, PNG o WEBP'));
  },
});

// Imagenes (logo / firmas) de las constancias de capacitacion.
const certificateImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = process.env.DIRECTORY_UPLOAD_CERTIFICATE || 'uploads/certificates';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `CERT-${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadCertificateImage = multer({
  storage: certificateImageStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedAvatarMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error('Solo se permiten imagenes JPG, PNG o WEBP'));
  },
});