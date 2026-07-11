import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/env.config';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { envSchema } from './config/env.schema';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { BullSharedModule } from './infrastructure/bull/bull.module';
import { MailerModule } from './infrastructure/mailer/mailer.module';
import { MinioModule } from './infrastructure/minio/minio.module';
import { LiveKitModule } from './infrastructure/livekit/livekit.module';
import { PdfModule } from './infrastructure/pdf/pdf.module';
import { TenantContextModule } from './common/tenant/tenant-context.module';
import { TenantResolverMiddleware } from './common/tenant/tenant-resolver.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { IdentityModule } from './modules/identity/identity.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { ProviderModule } from './modules/provider/provider.module';
import { PatientModule } from './modules/patient/patient.module';
import { FileStorageModule } from './modules/file-storage/file-storage.module';
import { BookingModule } from './modules/booking/booking.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ConsultationModule } from './modules/consultation/consultation.module';
import { DocumentationModule } from './modules/documentation/documentation.module';
import { PrescriptionModule } from './modules/prescription/prescription.module';
import { RecordingModule } from './modules/recording/recording.module';
import { NotificationModule } from './modules/notification/notification.module';
import { MisIntegrationModule } from './modules/mis-integration/mis-integration.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (cfg) => envSchema.parse(cfg),
    }),
    EventEmitterModule.forRoot(),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    // Generous default ceiling — meant as a DoS shield, not a per-feature
    // limit. Auth routes set tight per-route @Throttle overrides; hot
    // polling/webhook routes opt out via @SkipThrottle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    RedisModule,
    BullSharedModule,
    MailerModule,
    MinioModule,
    LiveKitModule,
    PdfModule,
    TenantContextModule,
    AuditModule,
    IdentityModule,
    TenantModule,
    ProviderModule,
    PatientModule,
    FileStorageModule,
    BookingModule,
    PaymentModule,
    ConsultationModule,
    DocumentationModule,
    PrescriptionModule,
    RecordingModule,
    NotificationModule,
    MisIntegrationModule,
    AnalyticsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    AppConfig,
    // Global rate limit (120 req/min/IP from ThrottlerModule.forRoot
    // above). Auth endpoints layer stricter per-route @Throttle limits
    // on top to slow brute-force / SMS-spam attempts.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Fail-closed auth: every route requires a JWT unless explicitly marked
    // @Public(). Routes authenticated by other means (ApiKeyGuard on
    // /integrations/*) carry @Public() so this guard steps aside while their
    // own guard still enforces access.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Idempotency runs BEFORE Audit so a replay (cache hit) short-circuits the
    // handler and still records one audit entry per real execution (from the
    // first request). Nest applies global interceptors in registration order.
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AppConfig],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
