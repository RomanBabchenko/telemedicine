import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentStatus, ReferralTargetType } from '@telemed/shared-types';
import { Prescription, PrescriptionItem } from '../domain/entities/prescription.entity';
import { Referral } from '../domain/entities/referral.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { PdfService } from '../../../infrastructure/pdf/pdf.service';
import { FileStorageService } from '../../file-storage/application/file-storage.service';

@Injectable()
export class PrescriptionService {
  constructor(
    @InjectRepository(Prescription) private readonly prescriptions: Repository<Prescription>,
    @InjectRepository(Referral) private readonly referrals: Repository<Referral>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly tenantContext: TenantContextService,
    private readonly pdf: PdfService,
    private readonly files: FileStorageService,
  ) {}

  async createPrescription(
    appointmentId: string,
    doctorUserId: string,
    items: PrescriptionItem[],
  ): Promise<Prescription> {
    const tenantId = this.tenantContext.getTenantId();
    const appointment = await this.appointments.findOne({ where: { id: appointmentId, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    const doctor = await this.doctors.findOne({ where: { userId: doctorUserId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const p = this.prescriptions.create({
      tenantId,
      appointmentId,
      doctorId: doctor.id,
      patientId: appointment.patientId,
      items,
      status: DocumentStatus.DRAFT,
    });
    return this.prescriptions.save(p);
  }

  async signPrescription(id: string): Promise<Prescription> {
    const tenantId = this.tenantContext.getTenantId();
    const p = await this.prescriptions.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Prescription not found');
    if (p.status !== DocumentStatus.SIGNED) {
      const buf = await this.renderPrescriptionPdf(p);
      const asset = await this.files.storeFromBuffer({
        purpose: 'document/prescription',
        contentType: 'application/pdf',
        buffer: buf,
      });
      p.pdfFileAssetId = asset.id;
      p.status = DocumentStatus.SIGNED;
      p.signedAt = new Date();
      await this.prescriptions.save(p);
    }
    return p;
  }

  async createReferral(
    appointmentId: string,
    doctorUserId: string,
    targetType: ReferralTargetType,
    instructions: string,
  ): Promise<Referral> {
    const tenantId = this.tenantContext.getTenantId();
    const appointment = await this.appointments.findOne({ where: { id: appointmentId, tenantId } });
    if (!appointment) throw new NotFoundException('Appointment not found');
    const doctor = await this.doctors.findOne({ where: { userId: doctorUserId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const r = this.referrals.create({
      tenantId,
      appointmentId,
      doctorId: doctor.id,
      patientId: appointment.patientId,
      targetType,
      instructions,
      status: DocumentStatus.SIGNED,
    });
    const saved = await this.referrals.save(r);

    // Render PDF immediately for MVP
    const buf = await this.renderReferralPdf(saved);
    const asset = await this.files.storeFromBuffer({
      purpose: 'document/referral',
      contentType: 'application/pdf',
      buffer: buf,
    });
    saved.pdfFileAssetId = asset.id;
    return this.referrals.save(saved);
  }

  async listForAppointment(appointmentId: string) {
    const tenantId = this.tenantContext.getTenantId();
    const [prescriptions, referrals] = await Promise.all([
      this.prescriptions.find({ where: { appointmentId, tenantId } }),
      this.referrals.find({ where: { appointmentId, tenantId } }),
    ]);
    return { prescriptions, referrals };
  }

  private async renderPrescriptionPdf(p: Prescription): Promise<Buffer> {
    const [doctor, patient, tenant] = await Promise.all([
      this.doctors.findOne({ where: { id: p.doctorId } }),
      this.patients.findOne({ where: { id: p.patientId } }),
      this.tenants.findOne({ where: { id: p.tenantId } }),
    ]);
    if (!doctor || !patient || !tenant) throw new Error('Missing related entity');
    return this.pdf.renderPrescription({
      documentId: p.id,
      patient: { firstName: patient.firstName, lastName: patient.lastName },
      doctor: {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialization: doctor.specializations[0] ?? 'Терапія',
      },
      clinic: { brandName: tenant.brandName },
      items: p.items,
      signedAt: p.signedAt,
      verificationUrl: `https://verify.telemed.local/p/${p.id}`,
    });
  }

  private async renderReferralPdf(r: Referral): Promise<Buffer> {
    const [doctor, patient, tenant] = await Promise.all([
      this.doctors.findOne({ where: { id: r.doctorId } }),
      this.patients.findOne({ where: { id: r.patientId } }),
      this.tenants.findOne({ where: { id: r.tenantId } }),
    ]);
    if (!doctor || !patient || !tenant) throw new Error('Missing related entity');
    return this.pdf.renderReferral({
      documentId: r.id,
      patient: { firstName: patient.firstName, lastName: patient.lastName },
      doctor: {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialization: doctor.specializations[0] ?? 'Терапія',
      },
      clinic: { brandName: tenant.brandName },
      targetType: r.targetType,
      instructions: r.instructions,
      verificationUrl: `https://verify.telemed.local/r/${r.id}`,
    });
  }
}
