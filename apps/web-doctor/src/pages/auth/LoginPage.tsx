import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const cfgQ = useAuthConfig();

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

  // Platform-wide kill switch: when AUTH_DISABLE_LOGIN_DOCTOR=true on the
  // API, render an explanation instead of the form. Only flip on a
  // confirmed `false` so a fetch error doesn't briefly hide a working form.
  if (cfgQ.data && cfgQ.data.doctorLoginEnabled === false) {
    return (
      <AuthCard title="Вхід для лікаря">
        <Alert variant="info" title="Самостійний вхід вимкнено">
          Зараз доступ до кабінету лікаря відкривається лише за персональним
          запрошенням з МІС клініки. Перейдіть за посиланням, надісланим на
          ваш email — ви потрапите одразу до призначеної консультації.
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Вхід для лікаря">
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
      <Button
        className="mt-4"
        fullWidth
        onClick={() => loginM.mutate()}
        isLoading={loginM.isPending}
      >
        Увійти
      </Button>
    </AuthCard>
  );
};
