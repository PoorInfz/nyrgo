import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {
  es: {
    translation: {
      tagline: 'Explora tu ciudad y descubre criaturas originales.',
      safety: 'Juega con cuidado: mira a tu alrededor y no entres en lugares privados.',
      server: 'Servidor',
      serverOk: 'conectado',
      serverDown: 'sin conexión',
      checking: 'comprobando…',
      phase: 'Fase 1 en construcción',
    },
  },
  en: {
    translation: {
      tagline: 'Explore your city and discover original creatures.',
      safety: 'Play safe: watch your surroundings and never enter private property.',
      server: 'Server',
      serverOk: 'connected',
      serverDown: 'offline',
      checking: 'checking…',
      phase: 'Phase 1 under construction',
    },
  },
} as const;

const preferred =
  typeof navigator !== 'undefined' && navigator.language.startsWith('en') ? 'en' : 'es';

void i18n.use(initReactI18next).init({
  resources,
  lng: preferred,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export default i18n;
