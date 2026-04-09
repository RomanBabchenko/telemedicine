import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/env.config';
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
      validate: (cfg) => envSchema.parse(cfg),
    }),
    EventEmitterModule.forRoot(),
    CqrsModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
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
