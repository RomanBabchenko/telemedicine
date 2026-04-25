import { ApiProperty } from '@nestjs/swagger';

export class RegenerateSlotsResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ description: 'Number of fresh OPEN slots created' })
  generated!: number;
}
