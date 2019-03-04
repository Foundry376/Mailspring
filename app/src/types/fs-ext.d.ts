export {};
declare module 'fs' {
  export function statSyncNoException(path: string): any;
}
