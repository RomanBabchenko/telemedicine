import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// Standard PDF Type 1 fonts (Helvetica/Times/Courier) only ship Western
// Latin glyphs, so any Cyrillic text we feed them gets remapped onto random
// latin shapes. We need a real TrueType font with WGL4/Cyrillic coverage.
//
// We don't ship a font in the repo (binary bloat) — instead we look for the
// first available system font from a short list of distros' default paths.
// Override via PDF_FONT_REGULAR_PATH / PDF_FONT_BOLD_PATH env vars if your
// host has them somewhere unusual.
const FONT_CANDIDATES_REGULAR = [
  process.env.PDF_FONT_REGULAR_PATH,
  // Linux
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/noto/NotoSans-Regular.ttf',
  // Windows
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/tahoma.ttf',
].filter((p): p is string => !!p);

const FONT_CANDIDATES_BOLD = [
  process.env.PDF_FONT_BOLD_PATH,
  // Linux
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/noto/NotoSans-Bold.ttf',
  // Windows
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/tahomabd.ttf',
].filter((p): p is string => !!p);

const findFirstExisting = (paths: string[]): string | null => {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
};

const FONT_REGULAR = 'CyrSans';
const FONT_BOLD = 'CyrSans-Bold';

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
  private readonly logger = new Logger(PdfService.name);
  private readonly regularPath: string | null;
  private readonly boldPath: string | null;
  private readonly regularFont: string;
  private readonly boldFont: string;

  constructor() {
    this.regularPath = findFirstExisting(FONT_CANDIDATES_REGULAR);
    this.boldPath = findFirstExisting(FONT_CANDIDATES_BOLD);
    this.regularFont = this.regularPath ? FONT_REGULAR : 'Helvetica';
    this.boldFont = this.boldPath ? FONT_BOLD : 'Helvetica-Bold';

    if (!this.regularPath) {
      this.logger.warn(
        'No Cyrillic-capable TTF found on this host — PDFs will use Helvetica and Cyrillic text will render as garbage. ' +
          'Install fonts-dejavu / fonts-liberation, or set PDF_FONT_REGULAR_PATH / PDF_FONT_BOLD_PATH env vars.',
      );
    } else {
      this.logger.log(
        `PDF font: regular=${this.regularPath}, bold=${this.boldPath ?? '(falling back to Helvetica-Bold)'}`,
      );
    }
  }

  async renderConclusion(input: RenderConclusionInput): Promise<Buffer> {
    return this.render(async (doc) => {
      this.header(doc, input.clinic.brandName, 'Медичний висновок');
      this.patientBlock(doc, input.patient);
      doc.moveDown(0.5);
      doc.fontSize(11).font(this.boldFont).text('Діагноз:');
      doc.font(this.regularFont).text(input.diagnosis);
      doc.moveDown();
      doc.font(this.boldFont).text('Рекомендації:');
      doc.font(this.regularFont).text(input.recommendations);
      if (input.notes) {
        doc.moveDown();
        doc.font(this.boldFont).text('Нотатки:');
        doc.font(this.regularFont).text(input.notes);
      }
      if (input.followUpInDays) {
        doc.moveDown();
        doc.font(this.boldFont).text('Повторний візит:');
        doc.font(this.regularFont).text(`Через ${input.followUpInDays} днів`);
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
      doc.font(this.boldFont).text('Призначення:');
      input.items.forEach((it, i) => {
        doc.moveDown(0.25);
        doc.font(this.regularFont).text(
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
      doc.font(this.boldFont).text('Тип направлення:');
      doc.font(this.regularFont).text(input.targetType);
      doc.moveDown();
      doc.font(this.boldFont).text('Інструкції:');
      doc.font(this.regularFont).text(input.instructions);
      this.signatureBlock(doc, input.doctor, null);
      await this.qr(doc, input.verificationUrl, input.documentId);
    });
  }

  private registerFonts(doc: PDFKit.PDFDocument): void {
    if (this.regularPath) doc.registerFont(FONT_REGULAR, this.regularPath);
    if (this.boldPath) doc.registerFont(FONT_BOLD, this.boldPath);
  }

  private async render(builder: (doc: PDFKit.PDFDocument) => Promise<void>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        this.registerFonts(doc);
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
    doc.fontSize(16).font(this.boldFont).text(brand, { align: 'right' });
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
    doc.fontSize(11).font(this.boldFont).text('Пацієнт:');
    doc.font(this.regularFont).text(`${patient.lastName} ${patient.firstName}`);
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
      .font(this.boldFont)
      .text(`Лікар: ${doctor.lastName} ${doctor.firstName}`);
    doc.font(this.regularFont).text(`Спеціальність: ${doctor.specialization}`);
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
