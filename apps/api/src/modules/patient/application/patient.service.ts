import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConsentStatus, ConsentType } from '@telemed/shared-types';
import { Patient } from '../domain/entities/patient.entity';
import { PatientTenantProfile } from '../domain/entities/patient-tenant-profile.entity';
import { Consent } from '../domain/entities/consent.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { MedicalDocument } from '../../documentation/domain/entities/medical-document.entity';
import { ProviderService } from '../../provider/application/provider.service';
import { FileStorageService } from '../../file-storage/application/file-storage.service';
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
    private readonly providers: ProviderService,
    private readonly files: FileStorageService,
  ) {}

  async getByUserId(userId: string): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  /**
   * Ensure a Patient record exists for the given user. Used by admin flows
   * where a User is created (or gets a PATIENT membership) without going
   * through the self-registration path that normally creates the Patient row.
   */
  async ensurePatientProfile(user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  }): Promise<Patient> {
    const existing = await this.patients.findOne({ where: { userId: user.id } });
    if (existing) return existing;
    const patient = this.patients.create({
      userId: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      phone: user.phone,
      preferredLocale: 'uk',
    });
    return this.patients.save(patient);
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

  async myDocuments(userId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const patient = await this.getByUserId(userId);
    const docs = await this.documents.find({
      where: { patientId: patient.id, tenantId },
      order: { createdAt: 'DESC' },
    });
    if (docs.length === 0) return [];

    const doctorIds = Array.from(new Set(docs.map((d) => d.authorDoctorId)));
    const doctorMap = await this.providers.getDoctorsByIds(doctorIds);

    return docs.map((d) => {
      const author = doctorMap.get(d.authorDoctorId);
      return {
        id: d.id,
        appointmentId: d.appointmentId,
        authorDoctorId: d.authorDoctorId,
        patientId: d.patientId,
        type: d.type,
        status: d.status,
        structuredContent: d.structuredContent,
        // The entity stores `pdfFileAssetId` (a MinIO key); turning it into a
        // signed URL is a separate file-storage concern that hasn't been wired
        // through to this endpoint yet. Returning null keeps the DTO contract
        // intact for the patient list view.
        pdfUrl: null,
        signedAt: d.signedAt,
        version: d.version,
        parentDocumentId: d.parentDocumentId,
        createdAt: d.createdAt,
        doctor: author
          ? {
              firstName: author.firstName,
              lastName: author.lastName,
              specializations: author.specializations,
            }
          : undefined,
      };
    });
  }

  /**
   * Resolve a signed download URL for one of the patient's own medical
   * documents. Ownership is enforced by the patient_id filter — a request
   * for somebody else's document yields 404, not 403, so attackers can't
   * tell whether the id exists.
   */
  async getMyDocumentPdfUrl(
    userId: string,
    documentId: string,
  ): Promise<{ url: string }> {
    const tenantId = this.tenantContext.getTenantId();
    const patient = await this.getByUserId(userId);
    const doc = await this.documents.findOne({
      where: { id: documentId, tenantId, patientId: patient.id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.pdfFileAssetId) {
      throw new NotFoundException('PDF is not generated yet');
    }
    return this.files.getDownloadUrl(doc.pdfFileAssetId);
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
