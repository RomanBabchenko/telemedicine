import { Injectable } from '@nestjs/common';

export interface RenderedTemplate {
  subject: string;
  body: string;
  html?: string;
}

type TemplateFn = (vars: Record<string, string | number | null>) => RenderedTemplate;

const TEMPLATES: Record<string, Record<string, TemplateFn>> = {
  uk: {
    'auth.welcome': (v) => ({
      subject: 'Ласкаво просимо до Telemed',
      body: `Доброго дня, ${v.firstName}! Ваш акаунт створено.`,
    }),
    'booking.confirmed': (v) => ({
      subject: 'Запис підтверджено',
      body: `Ваш запис на ${v.startAt} підтверджено. Лікар: ${v.doctorName}.`,
    }),
    'payment.succeeded': (v) => ({
      subject: 'Оплата успішна',
      body: `Оплата на суму ${v.amount} ${v.currency} успішно прийнята.`,
    }),
    'reminder.upcoming': (v) => ({
      subject: 'Нагадування про консультацію',
      body: `Ваша консультація з ${v.doctorName} відбудеться о ${v.startAt}.`,
    }),
    'session.join-link': (v) => ({
      subject: 'Посилання на консультацію',
      body: `Перейдіть за посиланням для входу: ${v.joinUrl}`,
    }),
    'document.ready': (v) => ({
      subject: 'Документ готовий',
      body: `Ваш ${v.documentType} готовий. Перегляньте його у кабінеті.`,
    }),
    'prescription.ready': () => ({
      subject: 'Рецепт готовий',
      body: 'Ваш електронний рецепт готовий до перегляду.',
    }),
  },
  en: {
    'auth.welcome': (v) => ({
      subject: 'Welcome to Telemed',
      body: `Hello ${v.firstName}, your account has been created.`,
    }),
    'booking.confirmed': (v) => ({
      subject: 'Appointment confirmed',
      body: `Your appointment on ${v.startAt} has been confirmed with ${v.doctorName}.`,
    }),
    'payment.succeeded': (v) => ({
      subject: 'Payment successful',
      body: `We received your payment of ${v.amount} ${v.currency}.`,
    }),
    'reminder.upcoming': (v) => ({
      subject: 'Upcoming consultation',
      body: `Your consultation with ${v.doctorName} is at ${v.startAt}.`,
    }),
    'session.join-link': (v) => ({
      subject: 'Consultation join link',
      body: `Use this link to join: ${v.joinUrl}`,
    }),
    'document.ready': (v) => ({
      subject: 'Document ready',
      body: `Your ${v.documentType} is ready in your patient portal.`,
    }),
    'prescription.ready': () => ({
      subject: 'Prescription ready',
      body: 'Your electronic prescription is ready to view.',
    }),
  },
};

@Injectable()
export class TemplateRegistry {
  render(
    code: string,
    locale: string,
    vars: Record<string, string | number | null>,
  ): RenderedTemplate {
    const lang = TEMPLATES[locale] ?? TEMPLATES.uk;
    const fn = lang?.[code] ?? TEMPLATES.uk?.[code];
    if (!fn) {
      return { subject: code, body: JSON.stringify(vars) };
    }
    return fn(vars);
  }
}
