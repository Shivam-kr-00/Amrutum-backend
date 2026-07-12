import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, refreshTokenSchema } from '../../validators/auth.validator';
import { ValidationError } from '../../utils/errors';

export class AuthController {
  private authService: AuthService;

  constructor(authService = new AuthService()) {
    this.authService = authService;
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.format());
      }

      const auditContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const user = await this.authService.register(parsed.data, auditContext);

      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.format());
      }

      const auditContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const result = await this.authService.login(parsed.data, auditContext);

      // We can set refresh token in an HTTP-only secure cookie for additional safety in browsers,
      // but return it in response body too since the specification asks to return refresh tokens.
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Allow getting refreshToken from body or cookie
      const token = req.body.refreshToken || req.cookies?.refreshToken;
      const parsed = refreshTokenSchema.safeParse({ refreshToken: token });
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.format());
      }

      const auditContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const result = await this.authService.refresh(parsed.data.refreshToken, auditContext);

      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        status: 'success',
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.body.refreshToken || req.cookies?.refreshToken;
      const parsed = refreshTokenSchema.safeParse({ refreshToken: token });
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.format());
      }

      const auditContext = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      await this.authService.logout(parsed.data.refreshToken, auditContext);

      res.clearCookie('refreshToken');

      res.status(200).json({
        status: 'success',
        message: 'Logout successful',
      });
    } catch (error) {
      next(error);
    }
  };
}
