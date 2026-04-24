import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentStatus, DocumentType } from '@telemed/shared-types';
import { MedicalDocument } from '../domain/entities/medical-document.entity';
import { Appointment } from '../../booking/domain/entities/appointment.entity';
import { Doctor } from '../../provider/domain/entities/doctor.entity';
import { Patient } from '../../patient/domain/entities/patient.entity';
import { Tenant } from '../../tenant/domain/entities/tenant.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { PdfService } from '../../../infrastructure/pdf/pdf.service';
import { FileStorageService } from '../../file-storage/application/file-storage.service';
import { DocumentSignedEvent } from '../events/document.events';

export interface CreateConclusionInput {
  appointmentId: string;
  doctorUserId: string;
  diagnosis: string;
  recommendations: string;
  notes?: string;
  followUpInDays?: number;
}

@Injectable()
export class DocumentationService {
  constructor(
    @InjectRepository(MedicalDocument)
    private readonly docs: Repository<MedicalDocument>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly tenantContext: TenantContextService,
    private readonly pdf: PdfService,
    private readonly files: FileStorageService,
    private readonly eventBus: EventBus,
  ) {}

  async listForAppointment(appointmentId: string): Promise<MedicalDocument[]> {
    const tenantId = this.tenantContext.getTenantId();
    return this.docs.find({
      where: { appointmentId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<MedicalDocument> {
    const tenantId = this.tenantContext.getTenantId();
    const doc = await this.docs.findOne({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async createConclusion(input: CreateConclusionInput): Promise<MedicalDocument> {
    const tenantId = this.tenantContext.getTenantId();
    const appointment = await this.appointments.findOne({
      where: { id: input.appointmentId, tenantId },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!appointment.patientId) {
      throw new BadRequestException(
        'Cannot attach a conclusion to an anonymous appointment.',
      );
    }

    const doctor = await this.doctors.findOne({ where: { userId: input.doctorUserId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const doc = this.docs.create({
      tenantId,
      appointmentId: appointment.id,
      authorDoctorId: doctor.id,
      patientId: appointment.patientId,
      type: DocumentType.CONCLUSION,
      status: DocumentStatus.DRAFT,
      structuredContent: {
        diagnosis: input.diagnosis,
        recommendations: input.recommendations,
        notes: input.notes ?? null,
        followUpInDays: input.followUpInDays ?? null,
      },
    });
    return this.docs.save(doc);
  }

  async sign(id: string): Promise<MedicalDocument> {
    const doc = await this.getById(id);
    if (doc.status === DocumentStatus.SIGNED) return doc;
    if (doc.status === DocumentStatus.VOIDED) {
      throw new BadRequestException('Voided documents cannot be signed');
    }
    doc.status = DocumentStatus.SIGNED;
    doc.signedAt = new Date();

    // Render PDF synchronously for MVP (small documents). In prod this is a BullMQ job.
    const buffer = await this.renderPdf(doc);
    const asset = await this.files.storeFromBuffer({
      purpose: `document/${doc.type.toLowerCase()}`,
      contentType: 'application/pdf',
      buffer,
    });
    doc.pdfFileAssetId = asset.id;

    const saved = await this.docs.save(doc);
    this.eventBus.publish(
      new DocumentSignedEvent(saved.id, saved.tenantId, saved.patientId, saved.authorDoctorId, saved.type),
    );
    return saved;
  }

  async getPdfUrl(id: string): Promise<{ url: string }> {
    const doc = await this.getById(id);
    if (!doc.pdfFileAssetId) throw new NotFoundException('PDF is not generated yet');
    return this.files.getDownloadUrl(doc.pdfFileAssetId);
  }

  private async renderPdf(doc: MedicalDocument): Promise<Buffer> {
    const [doctor, patient, tenant] = await Promise.all([
      this.doctors.findOne({ where: { id: doc.authorDoctorId } }),
      this.patients.findOne({ where: { id: doc.patientId } }),
      this.tenants.findOne({ where: { id: doc.tenantId } }),
    ]);
    if (!doctor || !patient || !tenant) {
      throw new Error('Missing related entity for PDF rendering');
    }
    const verificationUrl = `https://verify.telemed.local/d/${doc.id}`;
    const content = doc.structuredContent as {
      diagnosis: string;
      recommendations: string;
      notes?: string;
      followUpInDays?: number;
    };
    return this.pdf.renderConclusion({
      documentId: doc.id,
      appointmentId: doc.appointmentId,
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
      },
      doctor: {
        firstName: doctor.firstName,
        lastName: doctor.lastName,
        specialization: doctor.specializations[0] ?? 'Терапія',
      },
      clinic: { brandName: tenant.brandName },
      diagnosis: content.diagnosis,
      recommendations: content.recommendations,
      notes: content.notes ?? null,
      followUpInDays: content.followUpInDays ?? null,
      signedAt: doc.signedAt,
      verificationUrl,
    });
  }
}
