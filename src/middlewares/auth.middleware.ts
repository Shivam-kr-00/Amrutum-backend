import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { Role } from '@prisma/client';
import { AuthRepository, UserWithProfileAndDoctor } from '../modules/auth/auth.repository';
import redisClient from '../config/redis';
import logger from '../utils/logger';

const authRepository = new AuthRepository();

export interface UserPayload {
  userId: string;
  email: string;
  role: Role;
}

export type AuthenticatedUser = Omit<UserWithProfileAndDoctor, 'passwordHash'>;

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token missing');
    }

    let decoded: UserPayload;
    try {
      decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as UserPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }

    let safeUser: AuthenticatedUser | null = null;

    try {
      if (redisClient.isOpen) {
        const cachedUser = await redisClient.get(`user:profile:${decoded.userId}`);
        if (cachedUser) {
          safeUser = JSON.parse(cachedUser);
        }
      }
    } catch (cacheError) {
      logger.error('Redis cache read error in authentication middleware', cacheError);
    }

    if (!safeUser) {
      const user = await authRepository.findUserById(decoded.userId);
      if (!user) {
        throw new UnauthorizedError('User no longer exists in the system');
      }

      if (user.role === Role.DOCTOR && user.doctor) {
        if (user.doctor.status === 'SUSPENDED') {
          throw new ForbiddenError('Access denied: Doctor account is suspended');
        }
        if (user.doctor.status === 'REJECTED') {
          throw new ForbiddenError('Access denied: Doctor application was rejected');
        }
      }

      const { passwordHash: _, ...parsedUser } = user;
      safeUser = parsedUser;

      try {
        if (redisClient.isOpen) {
          await redisClient.set(
            `user:profile:${decoded.userId}`,
            JSON.stringify(safeUser),
            { EX: 300 }
          );
        }
      } catch (cacheError) {
        logger.error('Redis cache write error in authentication middleware', cacheError);
      }
    }

    req.user = safeUser;

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoles = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedError('User authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }

    next();
  };
};

