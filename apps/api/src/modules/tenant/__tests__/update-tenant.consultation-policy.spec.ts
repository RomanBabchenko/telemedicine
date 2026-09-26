import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RECORDING_NOTICE_MAX_LENGTH } from '@telemed/shared-types';
import { UpdateTenantBodyDto } from '../api/dto/update-tenant.body.dto';

const errorsFor = async (consultationPolicy: unknown) =>
  validate(plainToInstance(UpdateTenantBodyDto, { consultationPolicy }));

describe('UpdateTenantBodyDto.consultationPolicy', () => {
  it('accepts text at the length limit, a valid URL and nulls', async () => {
    await expect(
      errorsFor({
        recordingNoticeEnabled: true,
        recordingNoticeText: 'а'.repeat(RECORDING_NOTICE_MAX_LENGTH),
        offerUrl: 'https://clinic.example/oferta',
      }),
    ).resolves.toHaveLength(0);
    await expect(errorsFor({ recordingNoticeText: null, offerUrl: null })).resolves.toHaveLength(0);
  });

  it('rejects text over the limit', async () => {
    const errors = await errorsFor({
      recordingNoticeText: 'а'.repeat(RECORDING_NOTICE_MAX_LENGTH + 1),
    });
    expect(errors).not.toHaveLength(0);
  });

  it.each(['clinic.example/oferta', 'javascript:alert(1)', 'ftp://clinic.example'])(
    'rejects offerUrl %s',
    async (offerUrl) => {
      await expect(errorsFor({ offerUrl })).resolves.not.toHaveLength(0);
    },
  );
});
