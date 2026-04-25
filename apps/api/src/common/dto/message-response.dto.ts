import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'Email sent', description: 'Human-readable status message' })
  message!: string;
}
