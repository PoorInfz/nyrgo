import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../src/api';
import { ensureDeviceCheck } from '../src/near/deviceCheck';

function fakeApi(status: { enabled: boolean; verified: boolean }) {
  return {
    attestStatus: vi.fn(async () => ({ ...status, until: null, lastReason: null })),
    attestNonce: vi.fn(async () => ({
      nonce: 'n'.repeat(32),
      cloudProjectNumber: '42',
      packageName: 'fun.nyrgo.app',
    })),
    attest: vi.fn(async () => ({ verified: true as const, until: 'later' })),
  } as unknown as Api & { attest: ReturnType<typeof vi.fn> };
}

describe('device check in the Android app', () => {
  it('asks Play Integrity with the server nonce and sends the token', async () => {
    const api = fakeApi({ enabled: true, verified: false });
    const guard = { integrityToken: vi.fn(async () => ({ token: 'tok' })) };
    expect(await ensureDeviceCheck(api, { native: true, guard })).toBe(true);
    expect(guard.integrityToken).toHaveBeenCalledWith({
      nonce: 'n'.repeat(32),
      cloudProjectNumber: '42',
    });
    expect(api.attest).toHaveBeenCalledWith('n'.repeat(32), 'tok');
  });

  it('does nothing in a browser, when checks are off, or when already verified', async () => {
    const guard = { integrityToken: vi.fn() };
    expect(
      await ensureDeviceCheck(fakeApi({ enabled: true, verified: false }), {
        native: false,
        guard,
      }),
    ).toBe(false);
    expect(
      await ensureDeviceCheck(fakeApi({ enabled: false, verified: false }), {
        native: true,
        guard,
      }),
    ).toBe(false);
    expect(
      await ensureDeviceCheck(fakeApi({ enabled: true, verified: true }), { native: true, guard }),
    ).toBe(true);
    expect(guard.integrityToken).not.toHaveBeenCalled();
  });
});
