import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authRateLimiter } from '../../middlewares/rateLimiter.middleware';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new AuthController();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user (Patient or Doctor)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minimum: 8
 *               role:
 *                 type: string
 *                 enum: [PATIENT, DOCTOR, ADMIN]
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               specialization:
 *                 type: string
 *                 description: Required if role is DOCTOR
 *               experience:
 *                 type: integer
 *                 description: Required if role is DOCTOR
 *               consultationFee:
 *                 type: number
 *                 description: Required if role is DOCTOR
 *               bio:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 *       422:
 *         description: Validation failed
 */
router.post('/register', authRateLimiter, controller.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user and return access and refresh tokens
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid email or password
 */
router.post('/login', authRateLimiter, controller.login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using refresh token rotation
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', controller.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Revoke refresh token and logout user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', controller.logout);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get currently authenticated user details
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { user: req.user },
  });
});

export default router;
