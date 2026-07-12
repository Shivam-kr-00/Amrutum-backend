import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';
import config from '../config';
import { Prisma } from '@prisma/client';

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;

  logger.error(`${err.name}: ${err.message}`, {
    requestId: req.id,
    correlationId: req.correlationId,
    stack: err.stack,
  });

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ZodError') {
    statusCode = 422;
    message = 'Validation Error';
    details = (err as any).format ? (err as any).format() : err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = 'Conflict: Record already exists';
        details = { target: err.meta?.target };
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        break;
      default:
        statusCode = 400;
        message = 'Database request failed';
        details = { code: err.code };
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired';
  }

  const responseBody: any = {
    status: 'error',
    message,
    requestId: req.id,
  };

  if (details) {
    responseBody.details = details;
  }

  if (config.NODE_ENV !== 'production' && statusCode === 500) {
    responseBody.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
};
