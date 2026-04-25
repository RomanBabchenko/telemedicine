// patientId is nullable because anonymous-patient appointments have no
// Patient row. Handlers that notify the patient should short-circuit when
// it's null.
export class AppointmentReservedEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string | null,
    public readonly doctorId: string,
  ) {}
}

export class AppointmentConfirmedEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string | null,
    public readonly doctorId: string,
  ) {}
}

export class AppointmentCancelledEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string | null,
    public readonly doctorId: string,
    public readonly reason: string | null,
  ) {}
}

export class AppointmentCompletedEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
  ) {}
}

export class AppointmentRescheduledEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string | null,
    public readonly doctorId: string,
    public readonly oldStartAt: Date,
    public readonly oldEndAt: Date,
    public readonly newStartAt: Date,
    public readonly newEndAt: Date,
    public readonly reason: string | null,
  ) {}
}
