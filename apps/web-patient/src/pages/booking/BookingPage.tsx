import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { bookingApi } from '@telemed/api-client';
import { Alert, Button, Card, FormField, PageHeader, Textarea } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const booking = bookingApi(apiClient);

export const BookingPage = () => {
  const { slotId } = useParams<{ slotId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reserveM = useMutation({
    mutationFn: () =>
      booking.reserve({ slotId: slotId! }, `reserve-${slotId}`),
    onSuccess: (appointment) => {
      navigate(`/booking/${appointment.id}/payment`);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e?.response?.data?.message ?? 'Не вдалося зарезервувати слот'),
  });

  if (!user) {
    return (
      <Card>
        <Alert variant="info" title="Потрібен вхід">
          Спочатку увійдіть, щоб забронювати консультацію.
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate('/auth/login')}>Увійти</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Бронювання консультації" description="Опишіть причину звернення (опційно)" />
      <Card>
        <FormField label="Причина звернення">
          <Textarea
            placeholder="Скарги, попередні діагнози, що потрібно обговорити…"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => reserveM.mutate()} isLoading={reserveM.isPending}>
            Зарезервувати слот
          </Button>
        </div>
      </Card>
    </div>
  );
};
