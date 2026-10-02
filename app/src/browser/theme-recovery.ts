import fs from 'fs';
import path from 'path';

type ThemeRecoveryConfig = {
  set(keyPath: string, value: string): boolean;
};

// Bundled theme package names; mirrors the constants in theme-manager.ts, which
// is a renderer module and cannot be imported from the main process.
export const SAFE_THEME_SETTINGS = [
  ['core.theme', 'ui-automatic'],
  ['core.appearance.lightThemeName', 'ui-light'],
  ['core.appearance.darkThemeName', 'ui-dark'],
] as const;

// Matches the cacheDir layout in compile-cache-less.ts.
export function themeCompileCachePaths(configDirPath: string) {
  const compileCacheRoot = path.join(configDirPath, 'compile-cache');
  return [path.join(compileCacheRoot, 'less'), path.join(compileCacheRoot, 'less-rtl')];
}

/**
 * Restores the bundled theme selection after a theme failed to compile. A broken
 * theme can be referenced by `core.theme` or, in automatic mode, by the light or
 * dark theme name, so all three are reset. The compiled LESS cache is removed as
 * well because a corrupted cache entry produces the same parse errors as a
 * broken theme. Returns any cache removal errors so the caller can log them;
 * the settings reset is the part that matters for recovery.
 */
export function resetThemeForRecovery(
  config: ThemeRecoveryConfig,
  configDirPath: string,
  fileSystem: Pick<typeof fs, 'rmSync'> = fs
) {
  for (const [keyPath, value] of SAFE_THEME_SETTINGS) {
    config.set(keyPath, value);
  }

  const cacheClearErrors: Error[] = [];
  for (const cachePath of themeCompileCachePaths(configDirPath)) {
    try {
      fileSystem.rmSync(cachePath, { recursive: true, force: true });
    } catch (error) {
      cacheClearErrors.push(error);
    }
  }
  return cacheClearErrors;
}
