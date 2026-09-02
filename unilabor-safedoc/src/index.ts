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
import employeeDocumentRoutes from './routes/employee-document.routes';
import employeeAlertRoutes from './routes/employee-alert.routes';
import rhAcknowledgementRoutes from './routes/rh-acknowledgement.routes';
import rhPositionRoutes from './routes/rh-position.routes';
import rhInductionRoutes from './routes/rh-induction.routes';
import rhCompetencyEvaluationRoutes from './routes/rh-competency-evaluation.routes';
import trainingRoutes from './routes/training.routes';
import evaluationAssignmentRoutes from './routes/evaluation-assignment.routes';
import evaluationGradingRoutes from './routes/evaluation-grading.routes';
import helpdeskRoutes from './routes/helpdesk.routes';
import qualityReadingRoutes from './routes/quality-reading.routes';
import adminRoutes from './routes/admin.routes';
import providerRoutes from './routes/provider.routes';
import classificationRoutes from './routes/classification.routes';
import clientRoutes from './routes/client.routes';
import { assertRequiredEnv } from './config/env';
import { startEvaluationScheduler } from './services/evaluation-scheduler.service';
import { startServiceReminderScheduler } from './services/helpdesk-service-scheduler.service';
import { startAcknowledgementScheduler } from './services/rh-acknowledgement-scheduler.service';
import { startQualityReadingScheduler } from './services/quality-reading-scheduler.service';
import { startInductionScheduler } from './services/rh-induction-scheduler.service';
import { startProviderDocumentReminderScheduler } from './services/provider-document-scheduler.service';
import { startClientDocumentReminderScheduler } from './services/client-document-scheduler.service';

dotenv.config();

// Falla rapido si la configuracion critica (JWT_SECRET) es insegura o falta.
try {
  assertRequiredEnv();
} catch (error) {
  console.error('Configuracion invalida:', error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

// CORS config
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Limite ampliado: las actas de entrega-recepcion envian firmas electronicas
// (PNG en base64) dentro del JSON, que superan el default de 100kb.
app.use(express.json({ limit: '5mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/rh/document-structure', documentStructureRoutes);
app.use('/api/rh', employeeDocumentRoutes);
app.use('/api/rh', employeeAlertRoutes);
app.use('/api/rh', rhAcknowledgementRoutes);
app.use('/api/rh', rhPositionRoutes);
app.use('/api/rh', rhInductionRoutes);
app.use('/api/rh/competency-evaluations', rhCompetencyEvaluationRoutes);
app.use('/api/rh/trainings', trainingRoutes);
app.use('/api/rh/evaluations', evaluationGradingRoutes);
app.use('/api/rh', evaluationAssignmentRoutes);
app.use('/api/quality', qualityReadingRoutes);
app.use('/api/helpdesk', helpdeskRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/providers/classifications', classificationRoutes);
app.use('/api/providers/clients', clientRoutes);

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

const server = app.listen(PORT, () => {
  console.log(`Servidor SafeDoc corriendo en puerto ${PORT}`);
  // Scheduler de evaluaciones (recordatorios + vencimientos). Guardado por env.
  startEvaluationScheduler();
  // Scheduler de recordatorios de servicio (mantenimiento + calibracion). Guardado por env.
  startServiceReminderScheduler();
  // Scheduler de acuses de lectura (recordatorios + vencimientos). Guardado por env.
  startAcknowledgementScheduler();
  startQualityReadingScheduler();
  startInductionScheduler();
  // Scheduler de alertas de vencimiento de documentos de proveedor. Guardado por env.
  startProviderDocumentReminderScheduler();
  // Scheduler de alertas de vencimiento de documentos de cliente. Guardado por env.
  startClientDocumentReminderScheduler();
});

// Si no se pudo tomar el puerto (p. ej. otra instancia ya corre), el proceso
// debe MORIR: un proceso huerfano sin puerto seguiria vivo por el pool de PG y
// sus crons, duplicando recordatorios/notificaciones en cada tick.
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya esta en uso por otra instancia; este proceso termina.`);
  } else {
    console.error('Error del servidor HTTP; este proceso termina:', error);
  }
  process.exit(1);
});
