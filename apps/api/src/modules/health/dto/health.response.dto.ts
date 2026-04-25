import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    enum: ['ok', 'degraded'],
    description: "'ok' when every dependency is reachable; 'degraded' otherwise",
  })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['ok', 'fail'] })
  db!: 'ok' | 'fail';

  @ApiProperty({ enum: ['ok', 'fail'] })
  redis!: 'ok' | 'fail';

  @ApiProperty({ enum: ['ok', 'fail'] })
  minio!: 'ok' | 'fail';
}
