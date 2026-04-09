import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { paymentsApi } from '@telemed/api-client';
import { Alert, Button, Card, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const payments = paymentsApi(apiClient);

export const BookingPaymentPage = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const [intentId, setIntentId] = useState<string | null>(null);

  const intentQ = useQuery({
    queryKey: ['payment-intent', appointmentId],
    queryFn: () => payments.createIntent({ appointmentId: appointmentId! }),
    enabled: !!appointmentId,
  });

  useEffect(() => {
    if (intentQ.data?.intentId) setIntentId(intentQ.data.intentId);
  }, [intentQ.data?.intentId]);

  const succeedM = useMutation({
    mutationFn: () => payments.stubSucceed(intentId!),
    onSuccess: () => {
      navigate(`/booking/${appointmentId}/success`);
    },
  });

  if (intentQ.isLoading || !intentQ.data) return <Spinner />;
  const intent = intentQ.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Оплата консультації" />
      <Card>
        <p className="text-lg font-semibold">До сплати: {intent.amount} ₴</p>
        <p className="text-sm text-slate-500">
          У MVP використовується тестовий провайдер платежів. Натисніть кнопку, щоб імітувати успішну оплату.
        </p>
        <Alert variant="info">
          У продакшені тут буде форма картки або редирект на сторінку еквайра (LiqPay/Fondy).
        </Alert>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Назад
          </Button>
          <Button onClick={() => succeedM.mutate()} isLoading={succeedM.isPending}>
            Імітувати успішну оплату
          </Button>
        </div>
      </Card>
    </div>
  );
};
