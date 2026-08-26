import { ReactNode } from 'react';
import { Card, CardTitle } from './Card';
import { MedViewLogo } from './MedViewLogo';

interface Props {
  title: string;
  children: ReactNode;
  /** Small muted line under the card (e.g. audience hint). */
  footer?: ReactNode;
}

// Shared auth-screen layout (admin/doctor/patient login, OTP): centered
// MedView logo above a card that carries its own title.
export const AuthCard = ({ title, children, footer }: Props) => (
  <div className="mx-auto max-w-md py-16">
    <div className="mb-6 flex justify-center">
      <MedViewLogo size={40} withWordmark />
    </div>
    <Card>
      <CardTitle className="mb-4">{title}</CardTitle>
      {children}
    </Card>
    {footer ? <p className="mt-6 text-center text-sm text-slate-400">{footer}</p> : null}
  </div>
);
