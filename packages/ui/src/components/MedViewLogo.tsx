import { useId } from 'react';
import { cn } from '../lib/cn';

interface Props {
  /** Mark height in px (wordmark scales with it). */
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

// MedView "Pulse Play" logo (docs/medview-brand, brand guide v2.0).
// Colors are fixed by the guide and deliberately NOT tenant-themable:
// tenants brand themselves via logoUrl, this is the platform's own mark.
export const MedViewLogo = ({ size = 32, withWordmark = false, className }: Props) => {
  // Gradient defs are looked up document-wide by id, so two logos on one
  // page (header + login card) need unique ids to not shadow each other.
  const gradientId = useId();
  return (
    <span className={cn('inline-flex items-center', className)} style={{ gap: size * 0.27 }}>
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2563EB" />
            <stop offset="1" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <path
          d="M44 34 L96 60 L44 86 Z"
          stroke={`url(#${gradientId})`}
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <path
          d="M16 60 h20 l7 -14 9 28 8 -14 h14"
          stroke={`url(#${gradientId})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark ? (
        <span
          style={{
            fontFamily: "'Sora', -apple-system, 'Segoe UI', sans-serif",
            fontSize: size * 0.69,
            letterSpacing: '-0.015em',
            color: '#0B1B2B',
            lineHeight: 1,
          }}
        >
          <span style={{ fontWeight: 300 }}>Med</span>
          <span style={{ fontWeight: 800 }}>View</span>
        </span>
      ) : null}
    </span>
  );
};
