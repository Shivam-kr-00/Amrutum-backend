import winston from 'winston';
import config from '../config';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const redactSensitive = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'passwordHash', 'refreshToken', 'oldPassword', 'newPassword'];
  const redact = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(redact);
    
    const res: any = {};
    for (const key in obj) {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        res[key] = '[REDACTED]';
      } else {
        res[key] = redact(obj[key]);
      }
    }
    return res;
  };
  
  info.metadata = redact(info.metadata);
  if (info.message && typeof info.message === 'object') {
    info.message = redact(info.message);
  }
  return info;
});

const devFormat = printf(({ level, message, timestamp, correlationId, requestId, stack, ...meta }) => {
  const reqInfo = correlationId || requestId ? ` [Corr:${correlationId || ''}|Req:${requestId || ''}]` : '';
  const errorStack = stack ? `\n${stack}` : '';
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}]${reqInfo}: ${typeof message === 'object' ? JSON.stringify(message) : message}${metaString}${errorStack}`;
});

const logger = winston.createLogger({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'correlationId', 'requestId', 'stack'] }),
    redactSensitive()
  ),
  transports: [
    new winston.transports.Console({
      format: config.NODE_ENV === 'production' 
        ? combine(json()) 
        : combine(colorize(), devFormat),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: json(),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: json(),
    }),
  ],
});

export default logger;
