export class DocumentSignedEvent {
  constructor(
    public readonly documentId: string,
    public readonly tenantId: string,
    public readonly patientId: string,
    public readonly doctorId: string,
    public readonly type: string,
  ) {}
}
