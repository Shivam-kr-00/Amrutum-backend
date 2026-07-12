import prisma from '../../config/prisma';
import { RegisterInput } from '../../validators/auth.validator';
import { Role, User, Profile, Doctor, RefreshToken, Prisma } from '@prisma/client';

export type UserWithProfileAndDoctor = User & {
  profile: Profile | null;
  doctor: Doctor | null;
};

export class AuthRepository {
  async findUserByEmail(email: string): Promise<UserWithProfileAndDoctor | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        profile: true,
        doctor: true,
      },
    }) as Promise<UserWithProfileAndDoctor | null>;
  }

  async findUserById(id: string): Promise<UserWithProfileAndDoctor | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        doctor: true,
      },
    }) as Promise<UserWithProfileAndDoctor | null>;
  }

  async createUser(data: RegisterInput, passwordHash: string): Promise<UserWithProfileAndDoctor> {
    return prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          role: data.role,
        },
      });

      // 2. Create Profile
      const profile = await tx.profile.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth,
        },
      });

      let doctor = null;

      // 3. Create Doctor Profile if role is DOCTOR
      if (data.role === Role.DOCTOR) {
        doctor = await tx.doctor.create({
          data: {
            userId: user.id,
            specialization: data.specialization!,
            experience: data.experience!,
            consultationFee: new Prisma.Decimal(data.consultationFee!),
            bio: data.bio,
          },
        });
      }

      return {
        ...user,
        profile,
        doctor,
      };
    });
  }

  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  async findRefreshToken(token: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
    });
  }

  async revokeRefreshToken(id: string, replacedByToken?: string): Promise<RefreshToken> {
    return prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByToken,
      },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async createAuditLog(data: {
    userId?: string;
    action: string;
    targetTable: string;
    recordId?: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: data.userId || null,
          action: data.action,
          targetTable: data.targetTable,
          recordId: data.recordId || null,
          oldValue: data.oldValue ? (data.oldValue as Prisma.InputJsonValue) : Prisma.JsonNull,
          newValue: data.newValue ? (data.newValue as Prisma.InputJsonValue) : Prisma.JsonNull,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
        },
      });
    } catch (err) {
      // Do not fail operational flow if auditing fails, but log it
      console.error('Audit logging failed:', err);
    }
  }
}
