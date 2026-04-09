import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().default('telemed'),
  DB_PASSWORD: z.string().default('telemed'),
  DB_NAME: z.string().default('telemed'),
  DB_SYNCHRONIZE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  DB_LOGGING: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  MINIO_ACCESS_KEY: z.string().default('telemed'),
  MINIO_SECRET_KEY: z.string().default('telemed-secret'),
  MINIO_BUCKET: z.string().default('telemed-files'),
  MINIO_REGION: z.string().default('us-east-1'),

  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('devsecretdevsecretdevsecretdevsecret'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().default('Telemed Platform <noreply@telemed.local>'),

  PLATFORM_TENANT_ID: z
    .string()
    .uuid()
    .default('00000000-0000-0000-0000-000000000001'),

  PAYMENT_PROVIDER: z.enum(['stub', 'liqpay', 'fondy']).default('stub'),
  DOCDREAM_STUB_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
});

export type Env = z.infer<typeof envSchema>;
