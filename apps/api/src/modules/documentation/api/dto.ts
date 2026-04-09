import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateConclusionBodyDto {
  @ApiProperty() @IsString() diagnosis!: string;
  @ApiProperty() @IsString() recommendations!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) followUpInDays?: number;
}
