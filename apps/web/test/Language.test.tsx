import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import i18n, { LANGUAGES } from '../src/i18n';
import { LanguageSwitch } from '../src/components/LanguageSwitch';

function Sample() {
  const { t } = useTranslation();
  return <p>{t('loading')}</p>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('language', () => {
  it('starts in English, with English first in the list', () => {
    // nothing chosen and no ?lang= link when the module loaded
    expect(LANGUAGES[0].code).toBe('en');
    expect(i18n.options.lng).toBe('en');
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('switches from the selector, remembers it and labels the page', async () => {
    await i18n.changeLanguage('en');
    render(
      <>
        <LanguageSwitch />
        <Sample />
      </>,
    );
    expect(screen.getByText('Loading…')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } });
    expect(await screen.findByText('Cargando…')).toBeTruthy();
    expect(localStorage.getItem('nyrgo-lang')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'es');
  });
});
