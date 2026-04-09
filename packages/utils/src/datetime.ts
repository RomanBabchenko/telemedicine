import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isBetween);

export const dt = dayjs;

export const parseTime = (hhmm: string): { h: number; m: number } => {
  const [h, m] = hhmm.split(':').map((s) => Number.parseInt(s, 10));
  return { h: h ?? 0, m: m ?? 0 };
};

export const composeDateTime = (dateUtc: Dayjs, hhmm: string): Dayjs => {
  const { h, m } = parseTime(hhmm);
  return dateUtc.hour(h).minute(m).second(0).millisecond(0);
};

export const isoToDayjs = (iso: string): Dayjs => dayjs(iso);

export const formatIso = (date: Date | Dayjs): string =>
  dayjs(date as Date).toISOString();
