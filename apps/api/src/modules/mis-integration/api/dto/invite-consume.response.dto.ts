import { ApiProperty } from '@nestjs/swagger';
import {
  AuthTokensResponseDto,
  AuthUserResponseDto,
} from '../../../identity/api/dto/auth.response.dto';

export class InviteConsumeResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;

  @ApiProperty({ type: AuthTokensResponseDto })
  tokens!: AuthTokensResponseDto;

  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ format: 'uuid' })
  consultationSessionId!: string;
}
