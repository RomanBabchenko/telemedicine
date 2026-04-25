import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@telemed/shared-types';
import type {
  MembershipDto,
  UserDetailDto,
  UserStatus,
  UserSummaryDto,
} from '@telemed/shared-types';
import { PaginatedResponseDto, PaginationMetaDto } from '../../../../common/dto/pagination.dto';

export class UserSummaryResponseDto implements UserSummaryDto {
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

  @ApiProperty({ enum: ['ACTIVE', 'PENDING', 'BLOCKED'] })
  status!: UserStatus;

  @ApiProperty()
  mfaEnabled!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class MembershipResponseDto implements MembershipDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ type: String, nullable: true })
  tenantName!: string | null;

  @ApiProperty({ enum: Object.values(Role) })
  role!: Role;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class UserDetailResponseDto
  extends UserSummaryResponseDto
  implements UserDetailDto
{
  @ApiProperty({ type: [MembershipResponseDto] })
  memberships!: MembershipResponseDto[];
}

export class UsersPageResponseDto extends PaginatedResponseDto<UserDetailResponseDto> {
  @ApiProperty({ type: [UserDetailResponseDto] })
  declare items: UserDetailResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  declare meta: PaginationMetaDto;
}
