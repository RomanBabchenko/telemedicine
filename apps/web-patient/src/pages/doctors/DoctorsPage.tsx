import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { doctorsApi } from '@telemed/api-client';
import { Button, Card, EmptyState, Input, PageHeader, Spinner } from '@telemed/ui';
import { useDebouncedValue } from '@telemed/web-shared';
import { apiClient } from '../../lib/api';

const api = doctorsApi(apiClient);

const PAGE_SIZE = 20;

const toPrice = (raw: string): number | undefined => {
  const n = Number(raw);
  return raw !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

export const DoctorsPage = () => {
  const [specialization, setSpecialization] = useState('');
  const [minPriceRaw, setMinPriceRaw] = useState('');
  const [maxPriceRaw, setMaxPriceRaw] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSpecialization = useDebouncedValue(specialization);
  const debouncedMinPrice = toPrice(useDebouncedValue(minPriceRaw));
  const debouncedMaxPrice = toPrice(useDebouncedValue(maxPriceRaw));

  // New filter values invalidate the current page position.
  useEffect(() => {
    setPage(1);
  }, [debouncedSpecialization, debouncedMinPrice, debouncedMaxPrice]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'doctors',
      debouncedSpecialization,
      debouncedMinPrice,
      debouncedMaxPrice,
      page,
    ],
    queryFn: () =>
      api.search({
        specialization: debouncedSpecialization || undefined,
        minPrice: debouncedMinPrice,
        maxPrice: debouncedMaxPrice,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Лікарі"
        description="Оберіть лікаря, перегляньте профіль і виберіть зручний час."
      />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-64 flex-1">
          <Input
            placeholder="Спеціальність (наприклад, Кардіологія)"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Input
            type="number"
            min={0}
            placeholder="Ціна від, ₴"
            aria-label="Мінімальна ціна"
            value={minPriceRaw}
            onChange={(e) => setMinPriceRaw(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Input
            type="number"
            min={0}
            placeholder="Ціна до, ₴"
            aria-label="Максимальна ціна"
            value={maxPriceRaw}
            onChange={(e) => setMaxPriceRaw(e.target.value)}
          />
        </div>
      </div>
      {isLoading ? (
        <Spinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="Лікарів не знайдено" description="Спробуйте інший фільтр." />
      ) : (
        <>
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
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span className="text-sm text-slate-600">
                Сторінка {page} з {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Далі
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
