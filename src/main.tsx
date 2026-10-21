import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './components';
import Storefront from './Storefront';
import Admin from './Admin';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      {window.location.pathname.startsWith('/admin') ? <Admin /> : <Storefront />}
    </ToastProvider>
  </React.StrictMode>,
);
