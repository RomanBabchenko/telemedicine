// Post-consultation patient feedback («оцінка консультації»).
//
// IMPORTANT: this module must NOT import runtime values from './enums' — see
// the comment at the top of index.ts about Vite serving a stale `enums.js`.
// The runtime consts below are self-contained string literals.

// Answer to «Чи вирішено ваше питання?».
export type FeedbackResolved = 'YES' | 'PARTIALLY' | 'NO';

export const FEEDBACK_RESOLVED_VALUES: readonly FeedbackResolved[] = ['YES', 'PARTIALLY', 'NO'];

export const FEEDBACK_RESOLVED_LABELS: Record<FeedbackResolved, string> = {
  YES: 'Так',
  PARTIALLY: 'Частково',
  NO: 'Ні',
};

// Answer to «Наскільки зрозуміло лікар пояснив?» — 1..5 stars.
export type ClarityRating = 1 | 2 | 3 | 4 | 5;

export const CLARITY_RATING_VALUES: readonly ClarityRating[] = [1, 2, 3, 4, 5];

export const CLARITY_RATING_LABELS: Record<ClarityRating, string> = {
  1: 'Дуже незрозуміло',
  2: 'Незрозуміло',
  3: 'Посередньо',
  4: 'Зрозуміло',
  5: 'Дуже зрозуміло',
};

// Body of POST /appointments/:id/feedback (patient, invite-accessible).
export interface SubmitFeedbackDto {
  resolved: FeedbackResolved;
  clarityRating: ClarityRating;
}

// Compact projection attached to admin list rows (AppointmentDto.feedback).
export interface AppointmentFeedbackSummary {
  resolved: FeedbackResolved;
  clarityRating: number;
  submittedAt: string;
}

// Response of POST /appointments/:id/feedback and GET /appointments/:id/feedback.
export interface AppointmentFeedbackDto extends AppointmentFeedbackSummary {
  appointmentId: string;
}
