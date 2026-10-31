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
    fireEvent.click(screen.getByRole('button', { name: 'Language: English' }));
    const list = screen.getByRole('listbox');
    expect(list.querySelectorAll('[role=option]').length).toBe(LANGUAGES.length);
    fireEvent.click(screen.getByRole('option', { name: 'Español' }));
    expect(await screen.findByText('Cargando…')).toBeTruthy();
    expect(localStorage.getItem('nyrgo-lang')).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Idioma: Español' })).toBeTruthy();
  });

  it('loads a lazy language and turns the page right-to-left for Arabic', async () => {
    await i18n.changeLanguage('en');
    render(<LanguageSwitch />);
    fireEvent.click(screen.getByRole('button', { name: 'Language: English' }));
    fireEvent.click(screen.getByRole('option', { name: 'العربية' }));
    await screen.findByRole('button', { name: /العربية/ });
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('nyrgo-lang')).toBe('ar');
    await i18n.changeLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
