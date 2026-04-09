import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './domain/entities/patient.entity';
import { PatientTenantProfile } from './domain/entities/patient-tenant-profile.entity';
import { Consent } from './domain/entities/consent.entity';
import { ConsentArtifact } from './domain/entities/consent-artifact.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { MedicalDocument } from '../documentation/domain/entities/medical-document.entity';
import { PatientService } from './application/patient.service';
import { PatientController } from './api/patient.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      PatientTenantProfile,
      Consent,
      ConsentArtifact,
      Appointment,
      MedicalDocument,
    ]),
  ],
  providers: [PatientService],
  controllers: [PatientController],
  exports: [PatientService],
})
export class PatientModule {}
