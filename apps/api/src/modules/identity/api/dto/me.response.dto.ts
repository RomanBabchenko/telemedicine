import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ enum: Object.values(Role), isArray: true })
  roles!: Role[];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  tenantId!: string | null;

  @ApiProperty()
  mfaEnabled!: boolean;
}
