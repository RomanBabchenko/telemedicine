import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }
  get apiPort(): number {
    return this.config.get('API_PORT', { infer: true });
  }
  get globalPrefix(): string {
    return this.config.get('API_GLOBAL_PREFIX', { infer: true });
  }
  /**
   * CORS origins parsed from env. Supports two forms per comma-separated entry:
   *   - exact origin string, e.g. `http://localhost:5173`
   *   - regex prefixed with `regex:`, e.g. `regex:^http://192\.168\.\d+\.\d+:5173$`
   * Useful in dev when the LAN IP changes — you can whitelist a whole subnet
   * once instead of editing .env each time.
   */
  get corsOrigins(): (string | RegExp)[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((entry: string) =>
        entry.startsWith('regex:') ? new RegExp(entry.slice('regex:'.length)) : entry,
      );
  }

  get db() {
    return {
      host: this.config.get('DB_HOST', { infer: true }),
      port: this.config.get('DB_PORT', { infer: true }),
      user: this.config.get('DB_USER', { infer: true }),
      password: this.config.get('DB_PASSWORD', { infer: true }),
      name: this.config.get('DB_NAME', { infer: true }),
      synchronize: this.config.get('DB_SYNCHRONIZE', { infer: true }),
      logging: this.config.get('DB_LOGGING', { infer: true }),
    };
  }

  get redis() {
    return {
      host: this.config.get('REDIS_HOST', { infer: true }),
      port: this.config.get('REDIS_PORT', { infer: true }),
    };
  }

  get jwt() {
    return {
      accessSecret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      accessTtl: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshSecret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      refreshTtl: this.config.get('JWT_REFRESH_TTL', { infer: true }),
    };
  }

  get minio() {
    return {
      endpoint: this.config.get('MINIO_ENDPOINT', { infer: true }),
      port: this.config.get('MINIO_PORT', { infer: true }),
      useSSL: this.config.get('MINIO_USE_SSL', { infer: true }),
      accessKey: this.config.get('MINIO_ACCESS_KEY', { infer: true }),
      secretKey: this.config.get('MINIO_SECRET_KEY', { infer: true }),
      bucket: this.config.get('MINIO_BUCKET', { infer: true }),
      region: this.config.get('MINIO_REGION', { infer: true }),
    };
  }

  get livekit() {
    return {
      url: this.config.get('LIVEKIT_URL', { infer: true }),
      apiKey: this.config.get('LIVEKIT_API_KEY', { infer: true }),
      apiSecret: this.config.get('LIVEKIT_API_SECRET', { infer: true }),
    };
  }

  get smtp() {
    return {
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      user: this.config.get('SMTP_USER', { infer: true }),
      password: this.config.get('SMTP_PASSWORD', { infer: true }),
      from: this.config.get('SMTP_FROM', { infer: true }),
    };
  }

  get platformTenantId(): string {
    return this.config.get('PLATFORM_TENANT_ID', { infer: true });
  }

  get paymentProvider(): Env['PAYMENT_PROVIDER'] {
    return this.config.get('PAYMENT_PROVIDER', { infer: true });
  }

  get docdreamStubEnabled(): boolean {
    return this.config.get('DOCDREAM_STUB_ENABLED', { infer: true });
  }
}
