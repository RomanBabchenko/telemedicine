import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export interface RenderConclusionInput {
  documentId: string;
  appointmentId: string;
  patient: { firstName: string; lastName: string; dateOfBirth?: string | null };
  doctor: { firstName: string; lastName: string; specialization: string };
  clinic: { brandName: string };
  diagnosis: string;
  recommendations: string;
  notes?: string | null;
  followUpInDays?: number | null;
  signedAt?: Date | null;
  verificationUrl: string;
}

export interface RenderPrescriptionInput {
  documentId: string;
  patient: { firstName: string; lastName: string };
  doctor: { firstName: string; lastName: string; specialization: string };
  clinic: { brandName: string };
  items: Array<{ drug: string; dosage: string; frequency: string; durationDays: number; notes?: string }>;
  signedAt?: Date | null;
  verificationUrl: string;
}

export interface RenderReferralInput {
  documentId: string;
  patient: { firstName: string; lastName: string };
  doctor: { firstName: string; lastName: string; specialization: string };
  clinic: { brandName: string };
  targetType: string;
  instructions: string;
  verificationUrl: string;
}

@Injectable()
export class PdfService {
  async renderConclusion(input: RenderConclusionInput): Promise<Buffer> {
    return this.render(async (doc) => {
      this.header(doc, input.clinic.brandName, 'Медичний висновок');
      this.patientBlock(doc, input.patient);
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica-Bold').text('Діагноз:');
      doc.font('Helvetica').text(input.diagnosis);
      doc.moveDown();
      doc.font('Helvetica-Bold').text('Рекомендації:');
      doc.font('Helvetica').text(input.recommendations);
      if (input.notes) {
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Нотатки:');
        doc.font('Helvetica').text(input.notes);
      }
      if (input.followUpInDays) {
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Повторний візит:');
        doc.font('Helvetica').text(`Через ${input.followUpInDays} днів`);
      }
      this.signatureBlock(doc, input.doctor, input.signedAt);
      await this.qr(doc, input.verificationUrl, input.documentId);
    });
  }

  async renderPrescription(input: RenderPrescriptionInput): Promise<Buffer> {
    return this.render(async (doc) => {
      this.header(doc, input.clinic.brandName, 'Електронний рецепт');
      this.patientBlock(doc, input.patient);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Призначення:');
      input.items.forEach((it, i) => {
        doc.moveDown(0.25);
        doc.font('Helvetica').text(
          `${i + 1}. ${it.drug} — ${it.dosage}, ${it.frequency}, ${it.durationDays} дн.${it.notes ? ` (${it.notes})` : ''}`,
        );
      });
      this.signatureBlock(doc, input.doctor, input.signedAt);
      await this.qr(doc, input.verificationUrl, input.documentId);
    });
  }

  async renderReferral(input: RenderReferralInput): Promise<Buffer> {
    return this.render(async (doc) => {
      this.header(doc, input.clinic.brandName, 'Направлення');
      this.patientBlock(doc, input.patient);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Тип направлення:');
      doc.font('Helvetica').text(input.targetType);
      doc.moveDown();
      doc.font('Helvetica-Bold').text('Інструкції:');
      doc.font('Helvetica').text(input.instructions);
      this.signatureBlock(doc, input.doctor, null);
      await this.qr(doc, input.verificationUrl, input.documentId);
    });
  }

  private async render(builder: (doc: PDFKit.PDFDocument) => Promise<void>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        builder(doc)
          .then(() => doc.end())
          .catch(reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  private header(doc: PDFKit.PDFDocument, brand: string, title: string): void {
    doc.fontSize(16).font('Helvetica-Bold').text(brand, { align: 'right' });
    doc.moveDown(0.25);
    doc.fontSize(20).text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
  }

  private patientBlock(
    doc: PDFKit.PDFDocument,
    patient: { firstName: string; lastName: string; dateOfBirth?: string | null },
  ): void {
    doc.fontSize(11).font('Helvetica-Bold').text('Пацієнт:');
    doc.font('Helvetica').text(`${patient.lastName} ${patient.firstName}`);
    if (patient.dateOfBirth) {
      doc.text(`Дата народження: ${patient.dateOfBirth}`);
    }
  }

  private signatureBlock(
    doc: PDFKit.PDFDocument,
    doctor: { firstName: string; lastName: string; specialization: string },
    signedAt: Date | null | undefined,
  ): void {
    doc.moveDown(1.5);
    doc
      .font('Helvetica-Bold')
      .text(`Лікар: ${doctor.lastName} ${doctor.firstName}`);
    doc.font('Helvetica').text(`Спеціальність: ${doctor.specialization}`);
    if (signedAt) {
      doc.text(`Підписано: ${signedAt.toISOString()}`);
    }
  }

  private async qr(doc: PDFKit.PDFDocument, url: string, documentId: string): Promise<void> {
    try {
      const dataUrl = await QRCode.toDataURL(url, { margin: 0, width: 120 });
      const buf = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
      doc.image(buf, 445, 720, { width: 100, height: 100 });
      doc.fontSize(8).text(`ID: ${documentId.slice(0, 8)}…`, 445, 825, { width: 100 });
    } catch {
      // ignore QR rendering errors
    }
  }
}
