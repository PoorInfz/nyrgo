import type { Api } from '../api';
import { Guard, isNativeApp } from '../geo/native';

type IntegrityGuard = Pick<typeof Guard, 'integrityToken'>;

/**
 * In the Android app, makes sure the device passed today's Play Integrity check (the server
 * may require it for NEAR rewards). Does nothing in a browser or when the server has checks off.
 * Returns whether the player is verified now.
 */
export async function ensureDeviceCheck(
  api: Api,
  opts: { native?: boolean; guard?: IntegrityGuard } = {},
): Promise<boolean> {
  if (!(opts.native ?? isNativeApp())) return false;
  const status = await api.attestStatus();
  if (!status.enabled) return false;
  if (status.verified) return true;
  const n = await api.attestNonce();
  const { token } = await (opts.guard ?? Guard).integrityToken({
    nonce: n.nonce,
    cloudProjectNumber: n.cloudProjectNumber,
  });
  await api.attest(n.nonce, token);
  return true;
}
