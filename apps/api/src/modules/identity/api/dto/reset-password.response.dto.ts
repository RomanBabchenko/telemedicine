import { ApiProperty } from '@nestjs/swagger';
import type { ResetPasswordResponseDto as ResetPasswordContract } from '@telemed/shared-types';

export class ResetPasswordResponseDto implements ResetPasswordContract {
  @ApiProperty({ description: 'Freshly generated temporary password — must be rotated by the user after first login' })
  temporaryPassword!: string;
}
