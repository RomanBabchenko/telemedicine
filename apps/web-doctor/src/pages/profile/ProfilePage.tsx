import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const ProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const enrollM = useMutation({
    mutationFn: () => auth.mfaEnroll(),
    onSuccess: (res) => setQr(res.qrCodeDataUrl),
  });

  const verifyM = useMutation({
    mutationFn: () => auth.mfaVerify({ code }),
    onSuccess: () => setConfirmed(true),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Профіль лікаря" />
      <Card>
        <p>
          <strong>
            {user?.firstName} {user?.lastName}
          </strong>
        </p>
        <p>{user?.email}</p>
      </Card>
      <Card>
        <h3 className="mb-3 text-base font-semibold">Двофакторна автентифікація (TOTP)</h3>
        {!user?.mfaEnabled && !confirmed && (
          <>
            <Button onClick={() => enrollM.mutate()} isLoading={enrollM.isPending}>
              Згенерувати QR
            </Button>
            {qr && (
              <div className="mt-4 space-y-3">
                <img src={qr} alt="MFA QR" className="h-40 w-40" />
                <FormField label="Введіть код з застосунку">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} />
                </FormField>
                <Button onClick={() => verifyM.mutate()} isLoading={verifyM.isPending}>
                  Підтвердити
                </Button>
              </div>
            )}
          </>
        )}
        {(user?.mfaEnabled || confirmed) && <Alert variant="success">MFA увімкнено</Alert>}
      </Card>
    </div>
  );
};
