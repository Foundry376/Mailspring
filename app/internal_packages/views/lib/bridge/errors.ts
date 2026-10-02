export type ViewErrorCode =
  | 'permission'
  | 'quota'
  | 'invalid'
  | 'not_found'
  | 'limit'
  | 'unavailable'
  | 'timeout'
  | 'internal';

/** Errors the bridge returns to Views. Serialized as `{ code, message, feature?, permission? }`. */
export class ViewError extends Error {
  code: ViewErrorCode;
  feature?: string;
  permission?: string;

  constructor(
    code: ViewErrorCode,
    message: string,
    extra: { feature?: string; permission?: string } = {}
  ) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }

  toJSON() {
    const { code, message, feature, permission } = this;
    return { code, message, feature, permission };
  }
}

const QUERY_TIMEOUT_MS = 15 * 1000;

/**
 * Rejects with ViewError('timeout') if `work` hasn't settled in time. The query keeps running in
 * the background agent, but the View gets an answer instead of waiting forever.
 */
export function withTimeout<T>(work: Promise<T>, ms = QUERY_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ViewError(
            'timeout',
            `The query took longer than ${ms / 1000}s. Narrow it with a more specific filter.`
          )
        ),
      ms
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
