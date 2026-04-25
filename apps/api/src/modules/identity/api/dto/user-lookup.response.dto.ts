import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserLookupResponseDto as UserLookupContract } from '@telemed/shared-types';
import { UserSummaryResponseDto } from './user.response.dto';

export class UserLookupResponseDto implements UserLookupContract {
  @ApiProperty({ description: 'True when a user with the given email exists' })
  exists!: boolean;

  @ApiPropertyOptional({ type: UserSummaryResponseDto })
  user?: UserSummaryResponseDto;
}
