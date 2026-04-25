import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import type { SessionEventDto } from '@telemed/shared-types';

export class SessionEventBodyDto implements SessionEventDto {
  @ApiProperty({ description: 'Event type — matches the SessionEventType enum (JOIN, LEAVE, RECONNECT, ...)' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Free-form event payload stored verbatim in session_events.payload' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
