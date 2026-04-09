import { useEffect, useState } from 'react';
import type { CreateTenantDto } from '@telemed/shared-types';
import { Alert, Button, FormField, Input, Modal } from '@telemed/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateTenantDto) => void;
  isPending: boolean;
  error: unknown;
}

const errorMessage = (e: unknown): string => {
  if (!e) return '';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'Сталася помилка';
};

export const TenantFormModal = ({
  open,
  onClose,
  onSubmit,
  isPending,
  error,
}: Props) => {
  const [slug, setSlug] = useState('');
  const [brandName, setBrandName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1f7ae0');
  const [locale, setLocale] = useState('uk');
  const [currency, setCurrency] = useState('UAH');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setSlug('');
      setBrandName('');
      setSubdomain('');
      setPrimaryColor('#1f7ae0');
      setLocale('uk');
      setCurrency('UAH');
      setTouched(false);
    }
  }, [open]);

  const validate = (): string | null => {
    if (!slug.trim()) return 'Slug обовʼязковий';
    if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      return 'Slug — лише латиниця нижнього регістру, цифри та дефіси';
    }
    if (!brandName.trim()) return 'Назва обовʼязкова';
    if (!subdomain.trim()) return 'Поддомен обовʼязковий';
    if (!/^[a-z0-9-]+$/.test(subdomain.trim())) {
      return 'Поддомен — лише латиниця нижнього регістру, цифри та дефіси';
    }
    return null;
  };

  const submit = () => {
    setTouched(true);
    if (validate()) return;
    onSubmit({
      slug: slug.trim(),
      brandName: brandName.trim(),
      subdomain: subdomain.trim(),
      primaryColor: primaryColor.trim() || undefined,
      locale: locale.trim() || undefined,
      currency: currency.trim() || undefined,
    });
  };

  const validationError = touched ? validate() : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Створити клініку"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Скасувати
          </Button>
          <Button onClick={submit} isLoading={isPending}>
            Створити
          </Button>
        </>
      }
    >
      <div className="space-y-1">
        {validationError ? (
          <Alert variant="warning">{validationError}</Alert>
        ) : null}
        {error ? <Alert variant="danger">{errorMessage(error)}</Alert> : null}

        <FormField label="Slug" hint="Унікальний коротник у URL/БД, наприклад: clinic-plus">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </FormField>

        <FormField label="Назва клініки">
          <Input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Demo Clinic Plus"
          />
        </FormField>

        <FormField label="Поддомен" hint="Без точок, наприклад: clinic-plus">
          <Input
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
          />
        </FormField>

        <FormField label="Основний колір">
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#1f7ae0"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Локаль">
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} />
          </FormField>
          <FormField label="Валюта">
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
};
