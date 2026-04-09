import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doctorsApi } from '@telemed/api-client';
import { Button, Card, EmptyState, Input, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';

const api = doctorsApi(apiClient);

export const DoctorsPage = () => {
  const [specialization, setSpecialization] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doctors', specialization],
    queryFn: () => api.search({ specialization: specialization || undefined, page: 1, pageSize: 20 }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Лікарі"
        description="Оберіть лікаря, перегляньте профіль і виберіть зручний час."
      />
      <div className="flex gap-3">
        <Input
          placeholder="Спеціальність (наприклад, Кардіологія)"
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
        />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Лікарів не знайдено" description="Спробуйте інший фільтр." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data?.items.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {d.firstName} {d.lastName}
                  </h3>
                  <p className="text-sm text-slate-500">{d.specializations.join(', ')}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Стаж: {d.yearsOfExperience} років · Мови: {d.languages.join(', ')}
                  </p>
                  <p className="mt-2 text-base font-semibold">{d.basePrice} ₴</p>
                </div>
                <Link to={`/doctors/${d.id}`}>
                  <Button size="sm">Обрати</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
