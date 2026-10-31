import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fredoka';
import './i18n';
import { App } from './App';
import { keepUpdated } from './update';

keepUpdated();

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App apiUrl={apiUrl} />
  </StrictMode>,
);
