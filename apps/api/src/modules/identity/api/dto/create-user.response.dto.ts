import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserDetailResponseDto } from './user.response.dto';

export class CreateUserResponseDto {
  @ApiProperty({ type: UserDetailResponseDto })
  user!: UserDetailResponseDto;

  @ApiProperty({
    description: 'True when an existing user with this email was reused (membership attached) instead of a fresh create.',
  })
  reused!: boolean;

  @ApiPropertyOptional({
    description: 'Temporary password, present only for fresh creates where the caller did not supply one.',
  })
  generatedPassword?: string;

  @ApiPropertyOptional({
    description: 'Doctor profile payload — present only when the created user is a DOCTOR.',
    type: Object,
  })
  doctor?: Record<string, unknown>;
}
