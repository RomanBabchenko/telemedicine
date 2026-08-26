import 'reflect-metadata';
import {
  ClassSerializerInterceptor,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppConfig } from './config/env.config';
import { RedisIoAdapter } from './infrastructure/redis/redis-io.adapter';

async function bootstrap() {
  // rawBody: true preserves the original request bytes on req.rawBody so
  // webhook receivers (LiveKit, payment providers) can verify HMAC signatures
  // against exactly what was transmitted. Re-serialising req.body breaks the
  // hash because key order / whitespace differ from the sender's JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });
  // LiveKit webhooks are sent with Content-Type: application/webhook+json
  // (not plain application/json), so Express's default json parser skips
  // them — that leaves req.rawBody undefined and our webhook controller
  // 400s before verifying the signature. Register the extra content type
  // here so LiveKit payloads get the same raw-body treatment.
  app.useBodyParser('json', {
    type: ['application/json', 'application/webhook+json'],
  });
  const config = app.get(AppConfig);

  // In production the request chain is client → ALB → nginx (same box) → API,
  // and every hop appends to X-Forwarded-For. req.ip (audit trail, session
  // metadata, API-key IP allowlists) must be the CLIENT address, so Express
  // has to trust both proxy hops: loopback (nginx) and the ALB's private VPC
  // address (uniquelocal = RFC1918 ranges). Anything beyond those — i.e. the
  // rightmost public entry, which the ALB itself observed — is the client;
  // a spoofed XFF sent from the internet is discarded because its sender's
  // own address isn't trusted. Direct access to the API/nginx ports from
  // outside is already blocked by the security groups.
  app.set('trust proxy', ['loopback', 'uniquelocal']);

  // Redis-backed socket.io rooms — waiting-room chat/presence must reach
  // participants regardless of which API instance holds their socket.
  const ioAdapter = new RedisIoAdapter(app, config.redis.host, config.redis.port);
  await ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'Idempotency-Key'],
  });

  // Guard against stale .env values like `API_GLOBAL_PREFIX=api/v1`. The
  // `v1` segment belongs to URI versioning below; leaving it in the prefix
  // produces `/api/v1/v1/<route>`. Strip and warn so dev machines with old
  // configs self-correct.
  const rawPrefix = config.globalPrefix.replace(/^\/+|\/+$/g, '');
  const normalisedPrefix = rawPrefix.replace(/\/v\d+$/i, '');
  if (normalisedPrefix !== rawPrefix) {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  API_GLOBAL_PREFIX="${config.globalPrefix}" contains a version segment; stripping to "${normalisedPrefix}". Versions come from NestJS URI versioning — update your .env.`,
    );
  }
  app.setGlobalPrefix(normalisedPrefix);
  // URI versioning. Every controller without an explicit @Version() serves
  // v1 — final routes land at `/<prefix>/v1/<route>`. Future endpoints opt
  // into a newer version with `@Version('2')` etc. The `v1` segment is
  // produced here; keep `API_GLOBAL_PREFIX` free of version segments.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    // ClassSerializerInterceptor honours @Exclude on entity columns so even if
    // a controller accidentally returns a raw entity (instead of a mapped
    // ResponseDto), sensitive fields like User.passwordHash are stripped.
    new ClassSerializerInterceptor(app.get(Reflector)),
    new LoggingInterceptor(),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Telemed Platform API')
    .setDescription(
      'Telemedicine platform REST API. All responses follow the typed DTOs ' +
        'defined below; errors follow the shared ErrorResponseDto envelope. ' +
        'All endpoints are served under /api/v1/*.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Tenant-Id' }, 'tenant')
    .build();
  const doc = SwaggerModule.createDocument(app, swagger, {
    // Produce clean operation ids (e.g. `login` instead of `AuthController_login`)
    // so openapi-typescript / openapi-generator emit readable SDK method names.
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
  });
  // SwaggerModule.setup(`${normalisedPrefix}/docs`, app, doc);

  await app.listen(config.apiPort);
  // eslint-disable-next-line no-console
  console.log(
    `🩺 Telemed API listening on http://localhost:${config.apiPort}/${normalisedPrefix}/v1`,
  );
  // eslint-disable-next-line no-console
  // console.log(
  //   `📚 Swagger docs at http://localhost:${config.apiPort}/${normalisedPrefix}/docs`,
  // );
}

bootstrap();
