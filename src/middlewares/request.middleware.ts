import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      id: string;
      correlationId: string;
      startTime: number;
    }
  }
}

export const requestMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();

  req.id = requestId;
  req.correlationId = correlationId;
  req.startTime = Date.now();

  res.setHeader('x-request-id', requestId);
  res.setHeader('x-correlation-id', correlationId);

  logger.info(`Incoming Request: ${req.method} ${req.originalUrl}`, {
    requestId,
    correlationId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info(`Completed Request: ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${duration}ms`, {
      requestId,
      correlationId,
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
};
