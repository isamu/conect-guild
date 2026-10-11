/** Error kinds are the only failure detail the collector ever logs. */
export type CollectorErrorKind = 'gh-failed' | 'validation-failed' | 'write-failed';

export class CollectorError extends Error {
  readonly kind: CollectorErrorKind;

  constructor(kind: CollectorErrorKind) {
    super(kind);
    this.name = 'CollectorError';
    this.kind = kind;
  }
}

/** Map any thrown value to a loggable kind without exposing its message. */
export function errorKind(error: unknown): CollectorErrorKind | 'unexpected' {
  return error instanceof CollectorError ? error.kind : 'unexpected';
}
