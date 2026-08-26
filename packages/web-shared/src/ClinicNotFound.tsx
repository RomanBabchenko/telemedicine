// Rendered instead of the app when the clinic subdomain in the address does
// not resolve to a tenant. Deliberately router-free — it replaces the whole
// tree from main.tsx before the app mounts.
export const ClinicNotFound = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      fontFamily: 'system-ui, sans-serif',
      color: '#374151',
      padding: '1rem',
      textAlign: 'center',
    }}
  >
    <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Клініку не знайдено</h1>
    <p style={{ color: '#6b7280' }}>
      Перевірте адресу — такої клініки не існує або її було вимкнено.
    </p>
  </div>
);
