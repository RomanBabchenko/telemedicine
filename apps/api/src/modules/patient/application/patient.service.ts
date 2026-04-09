import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import { Patient } from '../domain/entities/patient.entity';
import { PatientTenantProfile } from '../domain/entities/patient-tenant-profile.entity';
import { Consent } from '../domain/entities/consent.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { MedicalDocument } from '../../documentation/domain/entities/medical-document.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientTenantProfile)
    private readonly profiles: Repository<PatientTenantProfile>,
    @InjectRepository(Consent) private readonly consents: Repository<Consent>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(MedicalDocument)
    private readonly documents: Repository<MedicalDocument>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getByUserId(userId: string): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  async getById(id: string): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { id } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async getPatientsByIds(ids: string[]): Promise<Map<string, Patient>> {
    if (!ids.length) return new Map();
    const patients = await this.patients.find({ where: { id: In(ids) } });
    return new Map(patients.map((p) => [p.id, p]));
  }

  async updateMe(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
      preferredLocale?: string;
    },
  ): Promise<Patient> {
    const patient = await this.getByUserId(userId);
    if (input.firstName !== undefined) patient.firstName = input.firstName;
    if (input.lastName !== undefined) patient.lastName = input.lastName;
    if (input.dateOfBirth !== undefined) patient.dateOfBirth = input.dateOfBirth;
    if (input.gender !== undefined) patient.gender = input.gender;
    if (input.preferredLocale !== undefined) patient.preferredLocale = input.preferredLocale;
    return this.patients.save(patient);
  }

  async myAppointments(userId: string): Promise<Appointment[]> {
    const tenantId = this.tenantContext.getTenantId();
    const patient = await this.getByUserId(userId);
    return this.appointments.find({
      where: { patientId: patient.id, tenantId },
      order: { startAt: 'DESC' },
    });
  }

  async myDocuments(userId: string): Promise<MedicalDocument[]> {
    const tenantId = this.tenantContext.getTenantId();
    const patient = await this.getByUserId(userId);
    return this.documents.find({
      where: { patientId: patient.id, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async myConsents(userId: string): Promise<Consent[]> {
    const tenantId = this.tenantContext.getTenantId();
    return this.consents.find({
      where: { userId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async grantConsent(userId: string, type: ConsentType, versionCode: string): Promise<Consent> {
    const tenantId = this.tenantContext.getTenantId();
    const existing = await this.consents.findOne({
      where: { userId, tenantId, type, status: ConsentStatus.GRANTED },
    });
    if (existing) return existing;
    const consent = this.consents.create({
      tenantId,
      userId,
      type,
      status: ConsentStatus.GRANTED,
      versionCode,
      grantedAt: new Date(),
    });
    return this.consents.save(consent);
  }

  async hasGrantedConsent(userId: string, type: ConsentType): Promise<boolean> {
    const tenantId = this.tenantContext.getTenantId();
    const c = await this.consents.findOne({
      where: { userId, tenantId, type, status: ConsentStatus.GRANTED },
    });
    return !!c;
  }
}
