import { Injectable, Logger } from '@nestjs/common';
import {
  ExternalDoctor,
  ExternalPatient,
  ExternalServiceType,
  ExternalSlot,
  MisConnector,
  NormalizedMisEvent,
} from '../../domain/ports/mis-connector';

const STUB_DOCTORS: ExternalDoctor[] = [
  {
    externalId: 'docdream-1',
    firstName: 'Михайло',
    lastName: 'Петренко',
    specialization: 'Неврологія',
    languages: ['uk'],
    yearsOfExperience: 12,
    basePrice: 700,
  },
  {
    externalId: 'docdream-2',
    firstName: 'Тетяна',
    lastName: 'Семенюк',
    specialization: 'Дерматологія',
    languages: ['uk', 'en'],
    yearsOfExperience: 8,
    basePrice: 600,
  },
];

const STUB_PATIENTS: ExternalPatient[] = Array.from({ length: 5 }, (_, i) => ({
  externalId: `mis-patient-${i + 1}`,
  firstName: `Стара карта ${i + 1}`,
  lastName: 'Клініки',
  email: `mis.patient${i + 1}@clinic-a.local`,
  phone: `+38063000000${i + 1}`,
  dateOfBirth: '1985-06-15',
}));

const STUB_SERVICES: ExternalServiceType[] = STUB_DOCTORS.map((d, i) => ({
  externalId: `mis-svc-${i + 1}`,
  doctorExternalId: d.externalId,
  name: 'Очний прийом',
  durationMin: 30,
  price: d.basePrice,
}));

@Injectable()
export class DocDreamStubConnector implements MisConnector {
  readonly id = 'docdream';
  private readonly logger = new Logger(DocDreamStubConnector.name);

  async listDoctors(): Promise<ExternalDoctor[]> {
    return STUB_DOCTORS;
  }

  async listPatients(): Promise<ExternalPatient[]> {
    return STUB_PATIENTS;
  }

  async listServiceTypes(): Promise<ExternalServiceType[]> {
    return STUB_SERVICES;
  }

  async listSlots(from: Date, to: Date): Promise<ExternalSlot[]> {
    const slots: ExternalSlot[] = [];
    const now = new Date(Math.max(from.getTime(), Date.now()));
    for (const svc of STUB_SERVICES) {
      for (let day = 0; day < 5; day += 1) {
        const slotDate = new Date(now);
        slotDate.setUTCDate(slotDate.getUTCDate() + day);
        slotDate.setUTCHours(14, 0, 0, 0);
        if (slotDate.getTime() > to.getTime()) break;
        const end = new Date(slotDate.getTime() + svc.durationMin * 60_000);
        slots.push({
          externalId: `mis-slot-${svc.externalId}-${day}`,
          doctorExternalId: svc.doctorExternalId,
          serviceTypeExternalId: svc.externalId,
          startAt: slotDate.toISOString(),
          endAt: end.toISOString(),
        });
      }
    }
    return slots;
  }

  async reserveSlot(
    externalSlotId: string,
  ): Promise<{ externalAppointmentId: string }> {
    return { externalAppointmentId: `mis-appt-${externalSlotId}-${Date.now()}` };
  }

  async updateAppointmentStatus(externalAppointmentId: string, status: string): Promise<void> {
    this.logger.log(`📤 stub MIS: ${externalAppointmentId} → ${status}`);
  }

  verifyWebhookSignature(): boolean {
    return true; // stub: signature verification always passes
  }

  parseWebhookEvent(body: string | Buffer): NormalizedMisEvent | null {
    try {
      const parsed = JSON.parse(typeof body === 'string' ? body : body.toString());
      return { type: parsed.type ?? 'appointment.status', payload: parsed };
    } catch {
      return null;
    }
  }
}
