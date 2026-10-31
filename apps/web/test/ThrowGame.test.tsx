import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../src/i18n';
import { ThrowGame } from '../src/screens/ThrowGame';

afterEach(() => cleanup());

describe('Tune the vault', () => {
  it('throws with what is charged when asked, then waits for the answer and finishes', async () => {
    await i18n.changeLanguage('en');
    const onThrow = vi.fn();
    const onFinished = vi.fn();
    const { rerender } = render(
      <ThrowGame
        rarity="rare"
        color="#43f289"
        vault="vault-basic"
        disabled={false}
        outcome={null}
        still
        onThrow={onThrow}
        onFinished={onFinished}
      />,
    );
    expect(screen.getByText('Tap to charge the vault!')).toBeTruthy();
    // nothing charged yet: the throw scores 0
    fireEvent.click(screen.getByRole('button', { name: 'Throw now' }));
    expect(onThrow).toHaveBeenCalledWith(0);
    expect(screen.queryByRole('button', { name: 'Throw now' })).toBeNull();
    // a second throw cannot start while the first is in the air
    expect(screen.queryByRole('button', { name: 'Charge the vault' })).toBeNull();
    rerender(
      <ThrowGame
        rarity="rare"
        color="#43f289"
        vault="vault-basic"
        disabled={false}
        outcome="caught"
        still
        onThrow={onThrow}
        onFinished={onFinished}
      />,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
