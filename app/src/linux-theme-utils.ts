import temp from 'temp';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import ini from 'ini';

const Context = {
  ACTIONS: 'actions',
  ANIMATIONS: 'animations',
  APPLICATIONS: 'applications',
  CATEGORIES: 'categories',
  DEVICES: 'devices',
  EMBLEMS: 'emblems',
  EMOTES: 'emotes',
  INTERNATIONAL: 'international',
  MIMETYPES: 'mimetypes',
  PANEL: 'panel',
  PLACES: 'places',
  STATUS: 'status',
};

const HOME = os.homedir();

const ICON_THEME_PATHS = [
  path.join(HOME, '.local/share/icons'),
  path.join(HOME, '.icons'),
  '/usr/share/icons',
  '/usr/local/share/icons',
];

const DESKTOP = process.env.XDG_CURRENT_DESKTOP;

const ICON_EXTENSION = ['.png', '.svg'];

/**
 * Create a gsettings command string for icons themes
 *
 * @returns {string} command
 * @private
 */
function __getGsettingsIconThemeCMD(): string {
  const path = __getDesktopSettingsPath();
  const key = 'icon-theme';
  return path != null ? `gsettings get ${path} ${key}` : null;
}

/**
 * Create a gsettings command string for themes
 *
 * @returns {string} command
 * @private
 */
function __getGsettingsGtkThemeCMD(): string {
  const path = __getDesktopSettingsPath();
  const key = 'gtk-theme';
  return path != null ? `gsettings ${path} ${key}` : null;
}

/**
 * Returns the path for the gsettings command. Currently only GNOME and MATE are supported
 *
 * @returns {*}
 * @private
 */
function __getDesktopSettingsPath(): string {
  switch (DESKTOP) {
    case 'MATE':
      return 'org.mate.interface';
    case 'GNOME':
    case 'Budgie:GNOME':
      return 'org.gnome.desktop.interface';
    default:
      return null;
  }
}

/**
 * Execute a command and return the string result
 *
 * @param {string} cmd to execute
 * @returns {string} result of the command
 * @private
 */
function __exec(cmd: string): string {
  try {
    return cmd == null ? null : execSync(cmd)
      .toString()
      .trim()
      .replace(/'/g, '');
  } catch (error) {
    console.warn(error);
    return null;
  }
}

/**
 * Get the current icon theme
 *
 * @returns {string} name of the icon
 */
function getIconThemeName(): string {
  return __exec(__getGsettingsIconThemeCMD());
}

/**
 * Get the current GTK theme
 *
 * @returns {string} name of the theme
 */
function getThemeName(): string {
  return __exec(__getGsettingsGtkThemeCMD());
}

/**
 * Parse the icon themes index.theme file
 *
 * @param {string} themePath path to the themes root
 * @returns {object} parsed ini file
 * @private
 */
function __parseIconTheme(themePath: string): object {
  const themeIndex = path.join(themePath, 'index.theme');
  if (fs.existsSync(themeIndex)) {
    return ini.parse(fs.readFileSync(themeIndex, 'utf-8'));
  }
  return null;
}

/**
 * Find the path to the icon theme and parse it
 *
 * @param {string} themeName to parse
 * @returns {IconTheme} containing the parsed index.theme file and path to the theme
 */
function getIconTheme(themeName): IconTheme {
  if (themeName != null) {
    for (const themesPath of ICON_THEME_PATHS) {
      const themePath = path.join(themesPath, themeName);
      const parsed = __parseIconTheme(themePath);
      if (parsed != null) {
        return {
          themePath: themePath,
          data: parsed,
        };
      }
    }
  }
  return null;
}

type IconTheme = {
  themePath: string;
  data: object;
}

/**
 * Get all possible icon paths
 *
 * @param {IconTheme} theme data
 * @param {string} iconName name of the icon
 * @param {number} size of the icon
 * @param {string|string[]} contexts of the icon
 * @param {1|2} [scale=1] of the icon
 * @returns {string[]} with all possibilities of the icon in one theme
 * @private
 */
function __getAllIconPaths(theme: IconTheme, iconName: string, size: number, contexts: string|string[], scale: 1|2 = 1): string[] {
  const icons = [];

  if (!(contexts instanceof Array)) {
    contexts = [contexts];
  }

  for (const [sectionName, section] of Object.entries(theme.data)) {
    if (sectionName !== 'Icon Theme') {
      const _context = section.Context.toLowerCase();
      const _minSize = parseInt(section.MinSize, 10);
      const _maxSize = parseInt(section.MaxSize, 10);
      const _size = parseInt(section.Size, 10);
      const _scale = parseInt(section.Scale, 10);

      if (
        contexts.indexOf(_context) > -1 &&
        (_size === size || (_minSize <= size && size <= _maxSize)) &&
        (scale == null || scale === _scale)
      ) {
        const iconDir = path.join(theme.themePath, sectionName);
        for (const extension of ICON_EXTENSION) {
          const iconPath = path.join(iconDir, iconName + extension);
          if (fs.existsSync(iconPath)) {
            icons.push(iconPath);
          }
        }
      }
    }
  }
  return icons;
}

/**
 * Get the icon from a theme
 *
 * @param {IconTheme} theme name
 * @param {string} iconName name of the icon
 * @param {number} size of the icon
 * @param {string|string[]} contexts to search in
 * @param {1|2} [scale=1] of the icon
 * @returns {string} path to the icon or null
 */
function getIconFromTheme(theme: IconTheme, iconName: string, size: number, contexts: string|string[], scale: 1|2 = 1) {
  const icons = __getAllIconPaths(theme, iconName, size, contexts, scale);
  for (let path of icons) {
    if (fs.existsSync(path)) {
      return fs.realpathSync(path);
    }
  }
  return null;
}

/**
 * Get the absolute path to the icon. If the icon is not found in the theme itself, the inherited
 * themes will be searched
 *
 * @param {string} iconName to search for
 * @param {number} size of the icon
 * @param {array|string} context the icons context
 * @param {1|2} [scale=1] 1 = normal, 2 = HiDPI version
 * @returns {string} absolute path of the icon
 */
function getIconPath(iconName: string, size: number, context: string|string[], scale: 1|2 = 1) {
  let defaultTheme = getIconTheme(getIconThemeName());
  if (defaultTheme != null) {
    let inherits = defaultTheme.data['Icon Theme']['Inherits'].split(',');

    let icon = getIconFromTheme(defaultTheme, iconName, size, context, scale);

    if (icon !== null) {
      return icon;
    }

    // in case the icon was not found in the theme, we search the inherited themes
    for (let key of inherits) {
      let inheritsTheme = getIconTheme(inherits[key]);
      icon = getIconFromTheme(inheritsTheme, iconName, size, context);
      if (icon !== null) {
        return icon;
      }
    }
  }

  return null;
}

/**
 * Return an icon from the current icon theme
 *
 * @param {string} iconName name of the icon you want to search for (i.e. mailspring)
 * @param {number} [size=22] size of the icon, if no exact size is found, the next possible one will be chosen
 * @param {array|string} [context=Context.APPLICATIONS] icon context to search in, defaults to APPLICATIONS
 * @param {number} [scale=2] icon scale, defaults to HiDPI version
 * @returns {string} path to the icon
 */
function getIcon(iconName, size = 22, context: string|string[] = [Context.APPLICATIONS], scale: 1|2 = 2) {
  if (process.platform !== 'linux') {
    throw Error('getIcon only works on linux');
  }

  return getIconPath(iconName, size, context, scale);
}

/**
 * Convert any icon to a png using ImageMagick. If ImageMagick is not present the icon cannot be
 * converted.
 *
 * @param {string} iconName to name the tmp file
 * @param {string} iconPath to the original icon to be converted
 * @returns {string} path to the converted tmp file
 */
function convertToPNG(iconName: string, iconPath: string) {
  try {
    const version = execSync('convert --version')
      .toString()
      .trim();
    if (!version) {
      console.warn('Cannot find ImageMagick');
      return null;
    }
    const tmpFile = temp.openSync({ prefix: iconName, suffix: '.png' });
    execSync(`convert ${iconPath} -transparent white ${tmpFile.path}`);
    return tmpFile.path;
  } catch (error) {
    console.warn(error);
  }
  return null;
}


export {
  convertToPNG,
  getIcon,
  getIconThemeName,
  getThemeName,
  Context,
}