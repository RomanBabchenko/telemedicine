import { ApiProperty } from '@nestjs/swagger';
import { SyncJobStatus } from '@telemed/shared-types';

export class SyncJobResponseDto {
  @ApiProperty({ example: true })
  ok!: true;

  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ type: Object, description: 'Connector-specific counters (rowsInserted, rowsUpdated, ...)' })
  stats!: Record<string, unknown>;

  @ApiProperty({ enum: Object.values(SyncJobStatus) })
  status!: SyncJobStatus;
}
