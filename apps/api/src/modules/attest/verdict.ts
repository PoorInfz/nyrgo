import type { IntegrityPayload } from './google.js';

export interface VerdictRules {
  packageName: string;
  nonce: string;
  /** Accept apps not installed from Google Play (sideloaded test builds). Testnet only. */
  allowUnrecognizedApp: boolean;
  nowMs: number;
}

/** What the game keeps of a verdict: no identifiers, only the judgements. */
export interface VerdictSummary {
  app: string;
  device: string[];
  licensing: string;
  locationSpoofing: string[];
  testing: boolean;
}

/**
 * Judges a decoded Play Integrity verdict: it must answer this request (nonce, package, recent)
 * and say the app is ours and the device genuine. Returns why not, or null when it passes.
 */
export function judge(
  p: IntegrityPayload,
  r: VerdictRules,
): { reason: string | null; summary: VerdictSummary } {
  const summary: VerdictSummary = {
    app: p.appIntegrity?.appRecognitionVerdict ?? 'UNEVALUATED',
    device: p.deviceIntegrity?.deviceRecognitionVerdict ?? [],
    licensing: p.accountDetails?.appLicensingVerdict ?? 'UNEVALUATED',
    locationSpoofing: p.environmentDetails?.locationSpoofingRiskVerdict ?? [],
    testing: p.testingDetails?.isTestingResponse ?? false,
  };
  const d = p.requestDetails;
  const fail = (reason: string) => ({ reason, summary });
  if (d?.requestPackageName !== r.packageName) return fail('wrong_package');
  if (d?.nonce !== r.nonce) return fail('wrong_nonce');
  const age = r.nowMs - Number(d?.timestampMillis ?? 0);
  if (!(age >= -60_000 && age <= 5 * 60_000)) return fail('stale');
  const appOk =
    summary.app === 'PLAY_RECOGNIZED' ||
    (r.allowUnrecognizedApp && summary.app === 'UNRECOGNIZED_VERSION');
  if (!appOk) return fail('app_not_recognized');
  if (!summary.device.includes('MEETS_DEVICE_INTEGRITY')) return fail('device_not_trusted');
  // Google's own spoofing signal: kept in the summary, and any "detected" level refuses.
  if (summary.locationSpoofing.some((v) => /DETECTED|HIGH/.test(v)))
    return fail('location_spoofing');
  return { reason: null, summary };
}
