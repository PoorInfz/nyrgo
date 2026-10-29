/**
 * Stable machine-readable error codes returned in RFC 9457 problem+json bodies.
 * The client maps these to localized messages; never change an existing code's meaning.
 */
export const ERROR_CODES = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  idempotency_mismatch: 422,
  rate_limited: 429,
  too_far: 422,
  spawn_expired: 410,
  speed_implausible: 422,
  accuracy_too_low: 422,
  cooldown_active: 429,
  insufficient_gold: 422,
  age_restricted: 403,
  reauth_required: 403,
  invalid_token: 400,
  email_taken: 409,
  bad_origin: 403,
  location_required: 428,
  already_caught: 409,
  creature_fled: 410,
  out_of_items: 409,
  starter_taken: 409,
  creature_exhausted: 409,
  battle_active: 409,
  already_won: 409,
  invalid_action: 422,
  level_required: 403,
  not_ready: 409,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
}

export function problem(code: ErrorCode, title: string, detail?: string): Problem {
  const base: Problem = {
    type: `https://nyrgo.dev/errors/${code}`,
    title,
    status: ERROR_CODES[code],
    code,
  };
  return detail === undefined ? base : { ...base, detail };
}
