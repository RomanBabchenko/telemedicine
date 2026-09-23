import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { FEEDBACK_RESOLVED_VALUES } from '@telemed/shared-types';
import type { ClarityRating, FeedbackResolved, SubmitFeedbackDto } from '@telemed/shared-types';

export class SubmitFeedbackBodyDto implements SubmitFeedbackDto {
  @ApiProperty({
    enum: FEEDBACK_RESOLVED_VALUES,
    description: 'Answer to «Чи вирішено ваше питання?»',
  })
  @IsIn(FEEDBACK_RESOLVED_VALUES)
  resolved!: FeedbackResolved;

  @ApiProperty({
    minimum: 1,
    maximum: 5,
    description: 'Answer to «Наскільки зрозуміло лікар пояснив?» — 1..5 stars',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  clarityRating!: ClarityRating;
}
