export class PaymentSucceededEvent {
  constructor(
    public readonly paymentId: string,
    public readonly tenantId: string,
    public readonly appointmentId: string,
    public readonly amount: number,
  ) {}
}
