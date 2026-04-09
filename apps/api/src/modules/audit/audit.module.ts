import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './domain/entities/audit-event.entity';
import { AuditLoggerService } from './application/audit-logger.service';
import { AuditController } from './api/audit.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  providers: [AuditLoggerService],
  controllers: [AuditController],
  exports: [AuditLoggerService],
})
export class AuditModule {}
