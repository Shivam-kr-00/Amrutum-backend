import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './docs/swagger';
import { requestMiddleware } from './middlewares/request.middleware';
import { errorMiddleware } from './middlewares/error.middleware';
import { apiRateLimiter } from './middlewares/rateLimiter.middleware';
import authRoutes from './modules/auth/auth.routes';
import prisma from './config/prisma';
import redisClient from './config/redis';
import logger from './utils/logger';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-request-id'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestMiddleware);

app.use('/api', apiRateLimiter);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/live', (_req, res) => {
  res.status(200).send('OK');
});

app.get('/ready', async (_req, res) => {
  const checks: Record<string, string> = {
    server: 'UP',
  };
  let status = 200;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'UP';
  } catch (error) {
    checks.database = 'DOWN';
    status = 503;
    logger.error('Readiness probe failed: Database is down', error);
  }

  try {
    if (redisClient.isOpen) {
      checks.redis = 'UP';
    } else {
      checks.redis = 'DOWN';
      status = 503;
      logger.error('Readiness probe failed: Redis client is closed');
    }
  } catch (error) {
    checks.redis = 'DOWN';
    status = 503;
    logger.error('Readiness probe failed: Redis is down', error);
  }

  res.status(status).json({
    status: status === 200 ? 'success' : 'error',
    checks,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorMiddleware);

export default app;
