import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConsentType } from '@telemed/shared-types';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdatePatientBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gender?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preferredLocale?: string;
}

export class GrantConsentBodyDto {
  @ApiProperty({ enum: ConsentType }) @IsEnum(ConsentType) type!: ConsentType;
  @ApiPropertyOptional() @IsOptional() @IsString() versionCode?: string;
}
