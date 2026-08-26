import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { Alert, AuthCard, Button, FormField, Input } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthConfig } from '../../hooks/useAuthConfig';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const OtpPage = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const cfgQ = useAuthConfig();

  const requestM = useMutation({
    mutationFn: () => auth.otpRequest({ phone }),
    onSuccess: () => setStage('verify'),
    onError: () => setError('Не вдалося надіслати код'),
  });

  const verifyM = useMutation({
    mutationFn: () => auth.otpVerify({ phone, code }),
    onSuccess: (res) => {
      setSession(res);
      navigate('/');
    },
    onError: () => setError('Невірний код'),
  });

  // Same kill switch as the patient LoginPage — OTP is also a patient
  // flow, gated by AUTH_DISABLE_LOGIN_PATIENT.
  if (cfgQ.data && cfgQ.data.patientLoginEnabled === false) {
    return (
      <AuthCard title="Вхід за OTP">
        <Alert variant="info" title="Самостійний вхід вимкнено">
          Зараз ця клініка приймає пацієнтів лише за індивідуальним
          запрошенням. Скористайтесь посиланням з листа або SMS від клініки,
          щоб перейти до своєї консультації.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Вхід за OTP">
      <Alert variant="info">
        В dev-режимі OTP відображається у логах API. Шукайте рядок «📱 OTP for ...».
      </Alert>
      <FormField label="Телефон">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={stage === 'verify'} />
      </FormField>
      {stage === 'verify' && (
        <FormField label="Код">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
      )}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {stage === 'request' ? (
        <Button className="mt-4" fullWidth onClick={() => requestM.mutate()} isLoading={requestM.isPending}>
          Надіслати код
        </Button>
      ) : (
        <Button className="mt-4" fullWidth onClick={() => verifyM.mutate()} isLoading={verifyM.isPending}>
          Підтвердити
        </Button>
      )}
    </AuthCard>
  );
};
