import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { ADMIN_CONSOLE_ROLES, hasAnyRole } from '@telemed/shared-types';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const loginM = useMutation({
    mutationFn: () => auth.login({ email, password }),
    onSuccess: (res) => {
      // Patients / doctors authenticate fine but have nothing here — tell
      // them instead of dropping them on an empty console.
      if (!hasAnyRole(res.user.roles, ADMIN_CONSOLE_ROLES)) {
        setError('Цей обліковий запис не має доступу до адмін-консолі');
        return;
      }
      setSession(res);
      navigate('/');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e?.response?.data?.message ?? 'Помилка входу'),
  });

  return (
    <div className="mx-auto max-w-md py-16">
      <PageHeader title="Вхід для адміністратора" />
      <Card>
        <FormField label="Email">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Пароль">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
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
