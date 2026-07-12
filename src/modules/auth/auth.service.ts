import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../../config';
import { AuthRepository } from './auth.repository';
import { RegisterInput, LoginInput } from '../../validators/auth.validator';
import { ConflictError, UnauthorizedError } from '../../utils/errors';
import logger from '../../utils/logger';
import { Role } from '@prisma/client';

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  private authRepository: AuthRepository;

  constructor(authRepository = new AuthRepository()) {
    this.authRepository = authRepository;
  }

  async register(data: RegisterInput, ctx: AuditContext) {
    const existingUser = await this.authRepository.findUserByEmail(data.email);
    if (existingUser) {
      throw new ConflictError('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, config.BCRYPT_SALT_ROUNDS);
    const user = await this.authRepository.createUser(data, passwordHash);

    logger.info(`User registered successfully: ${user.email} (Role: ${user.role})`);

    // Create Audit Log
    await this.authRepository.createAuditLog({
      userId: user.id,
      action: 'USER_REGISTER',
      targetTable: 'users',
      recordId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(data: LoginInput, ctx: AuditContext) {
    const user = await this.authRepository.findUserByEmail(data.email);
    if (!user) {
      logger.warn(`Login attempt failed: Email not found (${data.email})`);
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn(`Login attempt failed: Password mismatch for ${data.email}`);
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = this.generateRefreshToken(user.id, user.email, user.role);

    // Save refresh token
    const refreshExpiry = this.getRefreshTokenExpiry();
    await this.authRepository.createRefreshToken(user.id, refreshToken, refreshExpiry);

    logger.info(`User logged in successfully: ${user.email}`);

    // Create Audit Log
    await this.authRepository.createAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      targetTable: 'users',
      recordId: user.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return {
      accessToken,
      refreshToken,
      user: userWithoutPassword,
    };
  }

  async refresh(token: string, ctx: AuditContext) {
    const dbToken = await this.authRepository.findRefreshToken(token);

    // Token reuse / theft detection
    if (!dbToken) {
      logger.error('Refresh token not found in database. Attempting theft detection...');
      try {
        const decoded = jwt.decode(token) as { userId: string } | null;
        if (decoded && decoded.userId) {
          logger.warn(`Potential token theft: Revoking all refresh tokens for user ${decoded.userId}`);
          await this.authRepository.revokeAllUserRefreshTokens(decoded.userId);
          
          await this.authRepository.createAuditLog({
            userId: decoded.userId,
            action: 'TOKEN_THEFT_DETECTED_UNKNOWN_TOKEN',
            targetTable: 'refresh_tokens',
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
          });
        }
      } catch (err) {
        logger.error('Failed to decode unknown refresh token during theft detection', err);
      }
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if token has been revoked
    if (dbToken.revokedAt) {
      logger.warn(`Revoked refresh token reuse detected! User: ${dbToken.userId}`);
      // Token reuse logic: revoke all tokens for this user
      await this.authRepository.revokeAllUserRefreshTokens(dbToken.userId);

      await this.authRepository.createAuditLog({
        userId: dbToken.userId,
        action: 'TOKEN_REUSE_DETECTED',
        targetTable: 'refresh_tokens',
        recordId: dbToken.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });

      throw new UnauthorizedError('Refresh token has been revoked due to reuse detection');
    }

    // Check expiration
    if (new Date() > dbToken.expiresAt) {
      logger.warn(`Expired refresh token presented for user: ${dbToken.userId}`);
      await this.authRepository.revokeRefreshToken(dbToken.id);
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Generate new pair
    const user = await this.authRepository.findUserById(dbToken.userId);
    if (!user) {
      throw new UnauthorizedError('User associated with token not found');
    }

    const newAccessToken = this.generateAccessToken(user.id, user.email, user.role);
    const newRefreshToken = this.generateRefreshToken(user.id, user.email, user.role);

    // Rotate tokens: revoke the old one, link it, and save the new one
    await this.authRepository.revokeRefreshToken(dbToken.id, newRefreshToken);
    const refreshExpiry = this.getRefreshTokenExpiry();
    await this.authRepository.createRefreshToken(user.id, newRefreshToken, refreshExpiry);

    logger.info(`Refresh token rotated successfully for user: ${user.email}`);

    // Create Audit Log
    await this.authRepository.createAuditLog({
      userId: user.id,
      action: 'TOKEN_REFRESH',
      targetTable: 'refresh_tokens',
      recordId: dbToken.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(token: string, ctx: AuditContext) {
    const dbToken = await this.authRepository.findRefreshToken(token);
    if (dbToken && !dbToken.revokedAt) {
      await this.authRepository.revokeRefreshToken(dbToken.id);
      
      logger.info(`User logged out successfully: ID ${dbToken.userId}`);

      await this.authRepository.createAuditLog({
        userId: dbToken.userId,
        action: 'USER_LOGOUT',
        targetTable: 'refresh_tokens',
        recordId: dbToken.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
  }

  private generateAccessToken(userId: string, email: string, role: Role): string {
    return jwt.sign(
      { userId, email, role },
      config.JWT_ACCESS_SECRET,
      { expiresIn: config.JWT_ACCESS_EXPIRY as any }
    );
  }

  private generateRefreshToken(userId: string, email: string, role: Role): string {
    return jwt.sign(
      { userId, email, role },
      config.JWT_REFRESH_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRY as any }
    );
  }

  private getRefreshTokenExpiry(): Date {
    // Parse duration string e.g. "7d", "1d"
    const match = config.JWT_REFRESH_EXPIRY.match(/^(\d+)([dhm])$/);
    if (!match) {
      // Default to 7 days
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    const val = parseInt(match[1]);
    const unit = match[2];
    let ms = 0;
    if (unit === 'd') ms = val * 24 * 60 * 60 * 1000;
    else if (unit === 'h') ms = val * 60 * 60 * 1000;
    else if (unit === 'm') ms = val * 60 * 1000;
    return new Date(Date.now() + ms);
  }
}
