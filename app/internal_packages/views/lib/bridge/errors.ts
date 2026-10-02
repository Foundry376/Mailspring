export type ViewErrorCode =
  | 'permission'
  | 'quota'
  | 'invalid'
  | 'not_found'
  | 'limit'
  | 'unavailable'
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
