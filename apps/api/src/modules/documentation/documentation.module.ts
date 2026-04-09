import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MedicalDocument } from './domain/entities/medical-document.entity';
import { DocumentTemplate } from './domain/entities/document-template.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { DocumentationService } from './application/documentation.service';
import { DocumentationController } from './api/documentation.controller';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([MedicalDocument, DocumentTemplate, Doctor, Patient, Tenant, Appointment]),
  ],
  providers: [DocumentationService],
  controllers: [DocumentationController],
  exports: [DocumentationService],
})
export class DocumentationModule {}
