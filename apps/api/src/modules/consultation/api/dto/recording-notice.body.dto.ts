import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { RecordingNoticeDecision, RecordingNoticeDecisionDto } from '@telemed/shared-types';

export class RecordingNoticeBodyDto implements RecordingNoticeDecisionDto {
  @ApiProperty({
    enum: ['accepted', 'declined'],
    description: 'declined cancels the appointment and closes the room',
  })
  @IsIn(['accepted', 'declined'])
  decision!: RecordingNoticeDecision;
}
