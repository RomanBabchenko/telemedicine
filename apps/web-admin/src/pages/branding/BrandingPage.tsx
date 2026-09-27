import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '@telemed/api-client';
import { Alert, Button, Card, FormField, Input, PageHeader, Spinner } from '@telemed/ui';
import { apiClient } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';

const tenants = tenantsApi(apiClient);

export const BrandingPage = () => {
  const tenantId = useAuthStore((s) => s.tenantId);
  const qc = useQueryClient();
  const tenantQ = useQuery({ queryKey: ['tenant', 'current'], queryFn: () => tenants.current() });

  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
  const [logoUrl, setLogoUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  useEffect(() => {
    if (tenantQ.data) {
      setBrandName(tenantQ.data.brandName);
      setPrimaryColor(tenantQ.data.primaryColor);
      setLogoUrl(tenantQ.data.logoUrl ?? '');
      setWebsiteUrl(tenantQ.data.websiteUrl ?? '');
    }
  }, [tenantQ.data]);

  const updateM = useMutation({
    mutationFn: () =>
      tenants.update(tenantId!, {
        brandName,
        primaryColor,
        logoUrl: logoUrl || null,
        websiteUrl: websiteUrl.trim() || null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant', 'current'] }),
  });

  if (tenantQ.isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader title="Брендинг клініки" description="Логотип, кольори, назва" />
      <Card>
        <FormField label="Назва бренду">
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </FormField>
        <FormField label="Основний колір">
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#2563EB"
          />
        </FormField>
        <FormField label="URL логотипу">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </FormField>
        {/* Target of «Повернутися на сайт клініки» on the patient's post-call
         * screen. Empty = the button is hidden. */}
        <FormField label="Сайт клініки (URL)">
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://clinic.example"
          />
        </FormField>
        {updateM.isSuccess ? <Alert variant="success">Збережено</Alert> : null}
        {updateM.isError ? (
          <Alert variant="danger">
            Не вдалося зберегти. Перевірте, що URL сайту починається з http:// або https://.
          </Alert>
        ) : null}
        <div className="mt-4">
          <Button onClick={() => updateM.mutate()} isLoading={updateM.isPending}>
            Зберегти
          </Button>
        </div>
      </Card>
    </div>
  );
};
