import { ApiProperty } from '@nestjs/swagger';
import type { AuthConfigDto } from '@telemed/shared-types';

export class AuthConfigResponseDto implements AuthConfigDto {
  @ApiProperty({
    description:
      'False when AUTH_DISABLE_LOGIN_DOCTOR=true on the API. SPAs hide the doctor login form instead of letting it fail with 403 on submit.',
  })
  doctorLoginEnabled!: boolean;

  @ApiProperty({
    description:
      'False when AUTH_DISABLE_LOGIN_PATIENT=true on the API. Patient login + OTP + magic-link forms hide; invite-link consumption still works.',
  })
  patientLoginEnabled!: boolean;
}
