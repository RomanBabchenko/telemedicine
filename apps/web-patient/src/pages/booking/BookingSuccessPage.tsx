import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Card, PageHeader } from '@telemed/ui';

export const BookingSuccessPage = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  return (
    <div className="space-y-6">
      <PageHeader title="Запис підтверджено" />
      <Card>
        <Alert variant="success" title="Все готово!">
          Ваша консультація заброньована. Ви отримаєте посилання на електронну пошту.
        </Alert>
        <div className="mt-4 flex gap-2">
          <Link to={`/appointments/${appointmentId}/join`}>
            <Button>Перейти у залу очікування</Button>
          </Link>
          <Link to="/appointments">
            <Button variant="outline">Мої консультації</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};
