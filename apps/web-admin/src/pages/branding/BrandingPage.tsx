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
  const [primaryColor, setPrimaryColor] = useState('#1f7ae0');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (tenantQ.data) {
      setBrandName(tenantQ.data.brandName);
      setPrimaryColor(tenantQ.data.primaryColor);
      setLogoUrl(tenantQ.data.logoUrl ?? '');
    }
  }, [tenantQ.data]);

  const updateM = useMutation({
    mutationFn: () =>
      tenants.update(tenantId!, { brandName, primaryColor, logoUrl: logoUrl || null }),
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
            placeholder="#1f7ae0"
          />
        </FormField>
        <FormField label="URL логотипу">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        </FormField>
        {updateM.isSuccess ? <Alert variant="success">Збережено</Alert> : null}
        <div className="mt-4">
          <Button onClick={() => updateM.mutate()} isLoading={updateM.isPending}>
            Зберегти
          </Button>
        </div>
      </Card>
    </div>
  );
};
