import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppConfig } from './config/env.config';

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

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'Idempotency-Key'],
  });

  app.setGlobalPrefix(config.globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('Telemed Platform API')
    .setDescription('Telemedicine platform REST API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Tenant-Id' }, 'tenant')
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup(`${config.globalPrefix}/docs`, app, doc);

  await app.listen(config.apiPort);
  // eslint-disable-next-line no-console
  console.log(
    `🩺 Telemed API listening on http://localhost:${config.apiPort}/${config.globalPrefix}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `📚 Swagger docs at http://localhost:${config.apiPort}/${config.globalPrefix}/docs`,
  );
}

bootstrap();
