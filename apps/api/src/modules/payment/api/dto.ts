import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateIntentBodyDto {
  @ApiProperty() @IsString() appointmentId!: string;
}
