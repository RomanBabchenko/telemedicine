import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ProviderParamDto {
  @ApiProperty({
    description: 'Payment provider identifier (stub, stripe, liqpay, ...)',
    example: 'stub',
  })
  @IsString()
  provider!: string;
}
