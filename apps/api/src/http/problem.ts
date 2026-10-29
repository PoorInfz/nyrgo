import type { ErrorCode } from '@nyrgo/shared';

/** Throw from a handler to answer with an RFC 9457 problem+json body. */
export class HttpProblem extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
  }
}
