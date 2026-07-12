import { createClient } from 'redis';
import config from './index';
import logger from '../utils/logger';

const redisClient = createClient({
  url: config.REDIS_URL,
});

redisClient.on('connect', () => {
  logger.info('Connecting to Redis...');
});

redisClient.on('ready', () => {
  logger.info('Redis client is ready');
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

redisClient.on('end', () => {
  logger.warn('Redis client disconnected');
});

export const connectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
    }
  }
};

export default redisClient;
