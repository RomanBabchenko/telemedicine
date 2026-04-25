import { ApiProperty } from '@nestjs/swagger';
import type { MfaEnrollResponseDto as MfaEnrollContract } from '@telemed/shared-types';

export class MfaEnrollResponseDto implements MfaEnrollContract {
  @ApiProperty({ description: 'Base32-encoded TOTP secret — store in the authenticator app' })
  secret!: string;

  @ApiProperty({ description: 'otpauth://-style URL suitable for a QR renderer' })
  otpauthUrl!: string;

  @ApiProperty({ description: 'Data URL of a PNG QR code encoding the otpauth URL' })
  qrCodeDataUrl!: string;
}
