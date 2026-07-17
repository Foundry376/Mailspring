import path from 'path';
import os from 'os';
import fs from 'fs';

const HOME = os.homedir();

function buildPathsArray(
  homeEnvName: string,
  homeFallback: string,
  dirsEnvName: string,
  dirsFallback: string
): string[] {
  const paths: string[] = [];

  const homeEnv = process.env[homeEnvName];
  paths.push(homeEnv && path.isAbsolute(homeEnv) ? homeEnv : homeFallback);

  const dirsEnv = process.env[dirsEnvName] || dirsFallback;
  dirsEnv.split(path.delimiter).forEach((dir) => {
    if (dir && path.isAbsolute(dir) && !paths.includes(dir)) {
      paths.push(dir);
    }
  });

  return paths;
}

export const XDG_CONFIG_PATHS = buildPathsArray(
  'XDG_CONFIG_HOME',
  `${HOME}/.config`,
  'XDG_CONFIG_DIRS',
  '/etc/xdg'
);

export const XDG_DATA_PATHS = buildPathsArray(
  'XDG_DATA_HOME',
  `${HOME}/.local/share`,
  'XDG_DATA_DIRS',
  '/usr/local/share:/usr/share'
);

export function getFirstExistingPath(baseDirs: string[], subPath: fs.PathLike): string | null {
  for (const baseDir of baseDirs) {
    const fullPath = path.join(baseDir, subPath.toString());
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export const ICON_PATHS = XDG_DATA_PATHS.flatMap((dataPath) => [
  `${dataPath}/icons`,
  `${dataPath}/pixmaps`,
]).concat([`${HOME}/.icons`, os.tmpdir()]);
