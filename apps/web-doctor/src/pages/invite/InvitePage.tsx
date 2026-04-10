import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@telemed/api-client';
import { Alert, Card, PageHeader } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const auth = authApi(apiClient);

export const InvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Посилання недійсне — відсутній токен');
      return;
    }

    auth
      .consumeInvite({ token })
      .then((res) => {
        setSession({ user: res.user, tokens: res.tokens });
        navigate(`/consultation/${res.consultationSessionId}`, {
          replace: true,
        });
      })
      .catch((e: { response?: { data?: { message?: string } } }) => {
        setError(
          e?.response?.data?.message ?? 'Посилання недійсне або протерміноване',
        );
      });
  }, [token, navigate, setSession]);

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-12">
        <PageHeader title="Запрошення" />
        <Card>
          <Alert variant="danger">{error}</Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pt-12">
      <PageHeader title="Запрошення" />
      <Card>
        <p className="text-center text-gray-500">Завантаження...</p>
      </Card>
    </div>
  );
};
