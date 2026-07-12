import request from 'supertest';
import app from '../src/app';
import prisma from '../src/config/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '../src/config';

// Mock Prisma client
jest.mock('../src/config/prisma', () => {
  const mockUser = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const mockProfile = {
    create: jest.fn(),
  };
  const mockDoctor = {
    create: jest.fn(),
  };
  const mockRefreshToken = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const mockAuditLog = {
    create: jest.fn(),
  };

  const mockTx = {
    user: mockUser,
    profile: mockProfile,
    doctor: mockDoctor,
  };

  return {
    __esModule: true,
    default: {
      user: mockUser,
      profile: mockProfile,
      doctor: mockDoctor,
      refreshToken: mockRefreshToken,
      auditLog: mockAuditLog,
      $transaction: jest.fn((cb) => cb(mockTx)),
      $queryRaw: jest.fn(),
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    },
  };
});

// Mock Redis client
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: {
    isOpen: true,
    connect: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
  connectRedis: jest.fn(),
}));

describe('Authentication Module Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((cb) => cb({
      user: prisma.user,
      profile: prisma.profile,
      doctor: prisma.doctor,
    }));
  });

  describe('POST /api/auth/register', () => {
    it('should validate inputs and return 422 for malformed email/password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: '123',
          firstName: 'John',
          lastName: 'Doe',
        });

      expect(response.status).toBe(422);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('Validation failed');
    });

    it('should register a patient successfully', async () => {
      // Setup mock returns
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'patient-123',
        email: 'patient@example.com',
        role: 'PATIENT',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.profile.create as jest.Mock).mockResolvedValue({
        id: 'profile-123',
        userId: 'patient-123',
        firstName: 'John',
        lastName: 'Doe',
      });
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'patient@example.com',
          password: 'Password@123',
          role: 'PATIENT',
          firstName: 'John',
          lastName: 'Doe',
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe('patient@example.com');
      expect(response.body.data.user.passwordHash).toBeUndefined(); // Verify password hash is excluded
    });

    it('should register a doctor successfully when required fields are provided', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'doctor-123',
        email: 'doctor@example.com',
        role: 'DOCTOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (prisma.profile.create as jest.Mock).mockResolvedValue({
        id: 'profile-456',
        userId: 'doctor-123',
        firstName: 'Jane',
        lastName: 'Smith',
      });
      (prisma.doctor.create as jest.Mock).mockResolvedValue({
        id: 'doc-123',
        userId: 'doctor-123',
        specialization: 'Ayurveda',
        experience: 10,
        consultationFee: 500,
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'doctor@example.com',
          password: 'Password@123',
          role: 'DOCTOR',
          firstName: 'Jane',
          lastName: 'Smith',
          specialization: 'Ayurveda',
          experience: 10,
          consultationFee: 500,
        });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.role).toBe('DOCTOR');
    });

    it('should fail registering a doctor when specialization, experience, or fee is missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'doctor@example.com',
          password: 'Password@123',
          role: 'DOCTOR',
          firstName: 'Jane',
          lastName: 'Smith',
        });

      expect(response.status).toBe(422);
      expect(response.body.details.specialization).toBeDefined();
      expect(response.body.details.experience).toBeDefined();
      expect(response.body.details.consultationFee).toBeDefined();
    });

    it('should return 409 conflict if email is already taken', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'patient@example.com',
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'patient@example.com',
          password: 'Password@123',
          role: 'PATIENT',
          firstName: 'John',
          lastName: 'Doe',
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Email is already registered');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should successfully log in and return tokens', async () => {
      const hashedPassword = await bcrypt.hash('Password@123', 10);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'john@example.com',
        passwordHash: hashedPassword,
        role: 'PATIENT',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'Password@123',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.header['set-cookie']).toBeDefined(); // HttpOnly cookie test
    });

    it('should return 401 for wrong credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password@123',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid email or password');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate token successfully when valid refresh token is supplied', async () => {
      const mockToken = jwt.sign(
        { userId: 'user-123', email: 'john@example.com', role: 'PATIENT' },
        config.JWT_REFRESH_SECRET
      );

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'token-id-123',
        userId: 'user-123',
        token: mockToken,
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'john@example.com',
        role: 'PATIENT',
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mockToken });

      expect(response.status).toBe(200);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(prisma.refreshToken.update as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-id-123' },
          data: expect.objectContaining({
            replacedByToken: expect.any(String),
          }),
        })
      );
    });

    it('should revoke all tokens and throw 401 on revoked token reuse', async () => {
      const mockToken = jwt.sign(
        { userId: 'user-123', email: 'john@example.com', role: 'PATIENT' },
        config.JWT_REFRESH_SECRET
      );

      (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        id: 'token-id-123',
        userId: 'user-123',
        token: mockToken,
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: new Date(), // Revoked!
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: mockToken });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('revoked');
      expect(prisma.refreshToken.updateMany as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', revokedAt: null },
        })
      );
    });
  });

  describe('GET /api/auth/me', () => {
    it('should allow access to users with valid access token', async () => {
      const validAccessToken = jwt.sign(
        { userId: 'user-123', email: 'john@example.com', role: 'PATIENT' },
        config.JWT_ACCESS_SECRET
      );

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'john@example.com',
        role: 'PATIENT',
        profile: { firstName: 'John', lastName: 'Doe' },
        doctor: null,
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.user.email).toBe('john@example.com');
    });

    it('should return 401 for invalid access token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
