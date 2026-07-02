import path from 'path';
import os from 'os';
import fs from 'fs';

const HOME = os.homedir();

function buildPathsArray(
  homeEnvName: string,
  dirsEnvName: string,
  fallbackDirs: string[]
): string[] {
  const paths: string[] = [];

  const homeEnv = process.env[homeEnvName];
  if (homeEnv) {
    paths.push(homeEnv);
  }

  process.env[dirsEnvName]?.split(':').forEach((dir) => {
    if (dir && !paths.includes(dir)) {
      paths.push(dir);
    }
  });

  return paths.length > 0 ? paths : fallbackDirs;
}

export const XDG_CONFIG_PATHS = buildPathsArray('XDG_CONFIG_HOME', 'XDG_CONFIG_DIRS', [
  path.join(HOME, '.config'),
  '/etc/xdg',
]);

export const XDG_DATA_PATHS = buildPathsArray('XDG_DATA_HOME', 'XDG_DATA_DIRS', [
  path.join(HOME, '.local', 'share'),
  '/usr/local/share',
  '/usr/share',
]);

export const XDG_CACHE_PATHS = buildPathsArray('XDG_CACHE_HOME', 'XDG_CACHE_DIRS', [
  path.join(HOME, '.cache'),
]);

export const XDG_STATE_PATHS = buildPathsArray('XDG_STATE_HOME', 'XDG_STATE_DIRS', [
  path.join(HOME, '.local', 'state'),
]);

export function getFirstExistingPath(baseDirs: string[], subPath: fs.PathLike): string | null {
  for (const baseDir of baseDirs) {
    const fullPath = path.join(baseDir, subPath.toString());
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}
