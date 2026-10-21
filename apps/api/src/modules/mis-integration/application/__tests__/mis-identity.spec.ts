import { misDoctorEmail, misPatientEmail } from '../mis-identity';

describe('mis-identity synthetic emails', () => {
  const harmony = '11111111-1111-4111-8111-111111111111';
  const reprolife = '22222222-2222-4222-8222-222222222222';

  it('gives the same MIS external id a different login in each clinic', () => {
    const a = misDoctorEmail({ tenantId: harmony, connectorId: 'docdream', externalId: '105' });
    const b = misDoctorEmail({ tenantId: reprolife, connectorId: 'docdream', externalId: '105' });
    expect(a).not.toBe(b);
    expect(a).toBe(`doctor.docdream.105.${harmony}@mis-import.local`);
  });

  it('is stable for repeated webhooks from the same clinic', () => {
    const scope = { tenantId: harmony, connectorId: 'docdream', externalId: '7' };
    expect(misPatientEmail(scope)).toBe(misPatientEmail({ ...scope }));
    expect(misPatientEmail(scope)).toBe(`patient.docdream.7.${harmony}@mis-import.local`);
  });

  it('never collides between doctors and patients sharing an external id', () => {
    const scope = { tenantId: harmony, connectorId: 'docdream', externalId: '42' };
    expect(misDoctorEmail(scope)).not.toBe(misPatientEmail(scope));
  });
});
