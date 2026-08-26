import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { bootstrapTenant, ClinicNotFound } from '@telemed/web-shared';
import { App } from './App';
import { apiClient } from './lib/api';
import '@telemed/ui/styles.css';
import '@livekit/components-styles';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Resolve the clinic tenant from the subdomain (harmony.doctor.<domain>)
// before the first render so login/branding carry the right X-Tenant-Id.
// 'error' (API unreachable) falls through to the normal app.
bootstrapTenant(apiClient, 'doctor').then((status) => {
  root.render(
    status === 'not-found' ? (
      <ClinicNotFound />
    ) : (
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    ),
  );
});
