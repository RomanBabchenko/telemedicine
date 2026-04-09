import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const LoginPage = () => {
  const [email, setEmail] = useState('doctor1@demo.local');
  const [password, setPassword] = useState('demo1234');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const loginM = useMutation({
    mutationFn: () => auth.login({ email, password, mfaCode: mfaCode || undefined }),
    onSuccess: (res) => {
      setSession(res);
      navigate('/');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      const message = e?.response?.data?.message;
      if (message?.includes('MFA')) {
        setNeedsMfa(true);
      }
      setError(message ?? 'Помилка входу');
    },
  });

  return (
    <div className="mx-auto max-w-md py-16">
      <PageHeader title="Вхід для лікаря" />
      <Card>
        <FormField label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Пароль">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        {needsMfa && (
          <FormField label="MFA код (TOTP)">
            <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
          </FormField>
        )}
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => loginM.mutate()} isLoading={loginM.isPending}>
            Увійти
          </Button>
        </div>
      </Card>
    </div>
  );
};
