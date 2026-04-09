import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const LoginPage = () => {
  const [email, setEmail] = useState('patient1@demo.local');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const loginM = useMutation({
    mutationFn: () => auth.login({ email, password }),
    onSuccess: (res) => {
      setSession(res);
      navigate('/');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e?.response?.data?.message ?? 'Помилка входу'),
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Вхід" />
      <Card>
        <FormField label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Пароль">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="mt-4 flex items-center justify-between">
          <Link to="/auth/otp" className="text-sm text-[color:var(--color-primary)]">
            Увійти за OTP
          </Link>
          <Button onClick={() => loginM.mutate()} isLoading={loginM.isPending}>
            Увійти
          </Button>
        </div>
      </Card>
    </div>
  );
};
