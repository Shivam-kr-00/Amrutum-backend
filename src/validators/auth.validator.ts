import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  role: z.nativeEnum(Role).default(Role.PATIENT),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  phone: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.preprocess((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }, z.date()).optional(),
  specialization: z.string().optional(),
  experience: z.coerce.number().int().nonnegative().optional(),
  consultationFee: z.coerce.number().positive().optional(),
  bio: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === Role.DOCTOR) {
    if (!data.specialization || data.specialization.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['specialization'],
        message: 'Specialization is required for doctors',
      });
    }
    if (data.experience === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['experience'],
        message: 'Years of experience is required for doctors',
      });
    }
    if (data.consultationFee === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consultationFee'],
        message: 'Consultation fee is required for doctors',
      });
    }
  }
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
