import { ApiProperty } from '@nestjs/swagger';
import { FEEDBACK_RESOLVED_VALUES } from '@telemed/shared-types';
import type {
  AppointmentFeedbackDto,
  AppointmentFeedbackSummary,
  FeedbackResolved,
} from '@telemed/shared-types';

// Compact projection attached to admin list rows (AppointmentResponseDto.feedback).
export class AppointmentFeedbackSummaryDto implements AppointmentFeedbackSummary {
  @ApiProperty({ enum: FEEDBACK_RESOLVED_VALUES })
  resolved!: FeedbackResolved;

  @ApiProperty({ minimum: 1, maximum: 5 })
  clarityRating!: number;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class AppointmentFeedbackResponseDto
  extends AppointmentFeedbackSummaryDto
  implements AppointmentFeedbackDto
{
  @ApiProperty({ format: 'uuid' })
  appointmentId!: string;
}
