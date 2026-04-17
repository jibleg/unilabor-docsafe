import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import documentRoutes from './routes/document.routes';
import auditRoutes from './routes/audit.routes';
import categoryRoutes from './routes/category.routes';
import employeeRoutes from './routes/employee.routes';
import documentStructureRoutes from './routes/document-structure.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// CORS config
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/rh/document-structure', documentStructureRoutes);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      message: 'JSON invalido en el body de la solicitud',
    });
  }

  if (err?.name === 'MulterError') {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'El archivo excede el tamano maximo permitido' });
    }

    return res.status(400).json({ message: err?.message || 'Error al procesar archivo' });
  }

  if (typeof err?.message === 'string' && err.message.length > 0) {
    const isKnownUploadValidation =
      err.message.includes('Solo se permiten') || err.message.includes('archivo');

    if (isKnownUploadValidation) {
      return res.status(400).json({ message: err.message });
    }
  }

  console.error(err?.stack || err);
  return res.status(500).json({ message: 'Algo salio mal en el servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor SafeDoc corriendo en puerto ${PORT}`);
});
