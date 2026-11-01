// A 0 code is when an error returns without a status code, like "ESOCKETTIMEDOUT"
export const TimeoutErrorCodes = [
  0,
  408,
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
];
export const PermanentErrorCodes = [
  400,
  401,
  402,
  403,
  404,
  405,
  429,
  500,
  'ENOTFOUND',
  'ECONNREFUSED',
  'EHOSTDOWN',
  'EHOSTUNREACH',
];
export const CanceledErrorCodes = [-123, 'ECONNABORTED'];
export const SampleTemporaryErrorCode = 504;

/** Compatibility for plugins: hosted Mailspring services are not part of this fork. */
export function rootURLForServer(_server: 'identity'): string {
  throw new Error('Hosted Mailspring services are not available in BetterMailspring.');
}

export async function postStaticAsset(_asset: {
  filename: string;
  blob: string | Blob;
}): Promise<string> {
  throw new Error('Public asset hosting is not available in BetterMailspring.');
}

export async function makeRequest(_options: {
  server: 'identity';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: { [key: string]: any };
  timeout?: number;
  json?: true;
}): Promise<any> {
  throw new Error('Hosted Mailspring services are not available in BetterMailspring.');
}

export default {
  TimeoutErrorCodes,
  PermanentErrorCodes,
  CanceledErrorCodes,
  SampleTemporaryErrorCode,
  rootURLForServer,
  makeRequest,
  postStaticAsset,
};
