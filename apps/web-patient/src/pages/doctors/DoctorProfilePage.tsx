import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { bookingApi, doctorsApi } from '@telemed/api-client';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const doctors = doctorsApi(apiClient);
const booking = bookingApi(apiClient);

export const DoctorProfilePage = () => {
  const { id } = useParams<{ id: string }>();

  const doctorQ = useQuery({
    queryKey: ['doctor', id],
    queryFn: () => doctors.getById(id!),
    enabled: !!id,
  });

  const slotsQ = useQuery({
    queryKey: ['availability', id],
    queryFn: () =>
      booking.availability({
        doctorId: id!,
        from: dayjs().toISOString(),
        to: dayjs().add(14, 'day').toISOString(),
      }),
    enabled: !!id,
  });

  if (doctorQ.isLoading) return <Spinner />;
  const doctor = doctorQ.data;
  if (!doctor) return <EmptyState title="Лікаря не знайдено" />;

  return (
    <div className="space-y-6">
      <PageHeader title={`${doctor.firstName} ${doctor.lastName}`} description={doctor.specializations.join(', ')} />
      <Card>
        <p className="text-sm text-slate-700">{doctor.bio ?? 'Опис буде додано.'}</p>
        <p className="mt-2 text-sm text-slate-500">
          Стаж: {doctor.yearsOfExperience} років · Мови: {doctor.languages.join(', ')} · Ціна:{' '}
          <strong>{doctor.basePrice} ₴</strong>
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 font-semibold">Найближчі вільні слоти</h3>
        {slotsQ.isLoading ? (
          <Spinner />
        ) : (slotsQ.data?.length ?? 0) === 0 ? (
          <EmptyState title="Немає вільних слотів на найближчий час" />
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {slotsQ.data?.map((slot) => (
              <Link key={slot.id} to={`/booking/${slot.id}`}>
                <Button variant="outline" fullWidth>
                  {dayjs(slot.startAt).format('DD.MM HH:mm')}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
