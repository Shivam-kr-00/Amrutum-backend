import swaggerJsdoc from 'swagger-jsdoc';
import config from '../config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Amrutam Pharmaceuticals Telemedicine API',
      version: '1.0.0',
      description: 'Production-ready REST API for Amrutam Telemedicine Platform, providing doctor consultation bookings, authentication, prescriptions, payments, and audit logs.',
      contact: {
        name: 'Amrutam Tech Support',
        email: 'tech@amrutam.co.in',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.PORT}`,
        description: 'Development server',
      },
      {
        url: '/',
        description: 'Current host (Production/Staging)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token in the format: Bearer <token>',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/*.ts', './dist/modules/**/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
