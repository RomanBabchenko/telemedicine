import { ApiProperty } from '@nestjs/swagger';
import type { PatientDto } from '@telemed/shared-types';

export class PatientResponseDto implements PatientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date' })
  dateOfBirth!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gender!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'uk' })
  preferredLocale!: string;
}
