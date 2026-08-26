import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { Alert, AuthCard, Button, FormField, Input } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthConfig } from '../../hooks/useAuthConfig';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const cfgQ = useAuthConfig();

  const loginM = useMutation({
    mutationFn: () => auth.login({ email, password }),
    onSuccess: (res) => {
      setSession(res);
      navigate('/');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e?.response?.data?.message ?? 'Помилка входу'),
  });

  // Platform-wide kill switch: when AUTH_DISABLE_LOGIN_PATIENT=true on the
  // API, render an explanation instead of the form. Only flip on a
  // confirmed `false` so an /auth/config fetch error or pre-load doesn't
  // briefly hide a working form.
  if (cfgQ.data && cfgQ.data.patientLoginEnabled === false) {
    return (
      <AuthCard title="Вхід для пацієнта">
        <Alert variant="info" title="Самостійний вхід вимкнено">
          Зараз ця клініка приймає пацієнтів лише за індивідуальним
          запрошенням. Скористайтесь посиланням з листа або SMS від клініки,
          щоб перейти до своєї консультації.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Вхід для пацієнта">
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
      <Button
        className="mt-4"
        fullWidth
        onClick={() => loginM.mutate()}
        isLoading={loginM.isPending}
      >
        Увійти
      </Button>
      <div className="mt-3 text-center">
        <Link to="/auth/otp" className="text-sm text-[color:var(--color-primary)]">
          Увійти за OTP
        </Link>
      </div>
    </AuthCard>
  );
};
