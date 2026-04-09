export class AppointmentReservedEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string,
    public readonly doctorId: string,
  ) {}
}

export class AppointmentConfirmedEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string,
    public readonly doctorId: string,
  ) {}
}

export class AppointmentCancelledEvent {
  constructor(
    public readonly appointmentId: string,
    public readonly tenantId: string,
    public readonly patientId: string,
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
