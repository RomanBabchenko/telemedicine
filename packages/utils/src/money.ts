/**
 * Money helpers. Internally we keep amounts as integer cents to avoid float drift.
 * Public DTOs use a decimal number (e.g. 250.00) to keep frontend code simple.
 */

export const toCents = (amount: number): number => Math.round(amount * 100);

export const fromCents = (cents: number): number => Math.round(cents) / 100;

export const formatMoney = (amount: number, currency = 'UAH', locale = 'uk-UA'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

export const splitAmount = (
  totalCents: number,
  shares: { platform: number; clinic: number; doctor: number; misPartner?: number },
): { platform: number; clinic: number; doctor: number; misPartner: number } => {
  const totalPct =
    shares.platform + shares.clinic + shares.doctor + (shares.misPartner ?? 0);
  if (totalPct === 0) {
    return { platform: 0, clinic: 0, doctor: totalCents, misPartner: 0 };
  }
  const platform = Math.round((totalCents * shares.platform) / totalPct);
  const clinic = Math.round((totalCents * shares.clinic) / totalPct);
  const misPartner = Math.round((totalCents * (shares.misPartner ?? 0)) / totalPct);
  // Doctor gets the remainder so that the sum is exact.
  const doctor = totalCents - platform - clinic - misPartner;
  return { platform, clinic, doctor, misPartner };
};
