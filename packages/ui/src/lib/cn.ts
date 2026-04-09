import clsx, { ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
