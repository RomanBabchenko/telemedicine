import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prescription } from './domain/entities/prescription.entity';
import { Referral } from './domain/entities/referral.entity';
import { Appointment } from '../booking/domain/entities/appointment.entity';
import { Doctor } from '../provider/domain/entities/doctor.entity';
import { Patient } from '../patient/domain/entities/patient.entity';
import { Tenant } from '../tenant/domain/entities/tenant.entity';
import { PrescriptionService } from './application/prescription.service';
import { PrescriptionController } from './api/prescription.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Prescription, Referral, Appointment, Doctor, Patient, Tenant]),
  ],
  providers: [PrescriptionService],
  controllers: [PrescriptionController],
  exports: [PrescriptionService],
})
export class PrescriptionModule {}
