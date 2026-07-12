import app from './app';
import config from './config';
import prisma from './config/prisma';
import redisClient, { connectRedis } from './config/redis';
import logger from './utils/logger';

const PORT = config.PORT;

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Server running in ${config.NODE_ENV} mode on port ${PORT}`);
  logger.info(`Swagger docs available at http://localhost:${PORT}/api/docs`);

  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database during startup', error);
  }

  try {
    await connectRedis();
  } catch (error) {
    logger.error('Failed to connect to Redis during startup', error);
  }
});

const gracefulShutdown = async (signal: string) => {
  logger.warn(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (err) {
      logger.error('Error closing database connection', err);
    }

    try {
      if (redisClient.isOpen) {
        await redisClient.quit();
        logger.info('Redis connection closed');
      }
    } catch (err) {
      logger.error('Error closing Redis connection', err);
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});
