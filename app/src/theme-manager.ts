import { ipcRenderer } from 'electron';
import { Emitter, Disposable } from 'event-kit';
import path from 'path';
import fs from 'fs';
import { localized } from './intl';
import LessCompileCache from './less-compile-cache';
import PackageManager from './package-manager';

const CONFIG_THEME_KEY = 'core.theme';
const CONFIG_USE_SYSTEM_ACCENT_KEY = 'core.appearance.useSystemAccent';
const SYSTEM_ACCENT_SOURCE_PATH = 'system-accent:dynamic';
const AUTOMATIC_THEME_NAME = 'ui-automatic';
const LIGHT_THEME_NAME = 'ui-light';
const DARK_THEME_NAME = 'ui-dark';

function buildSystemAccentCSS(color: string): string {
  return `:root {
  --system-accent: ${color};
  --system-accent-dark: color-mix(in srgb, ${color}, black 10%);
}`;
}

/**
 * The ThemeManager observes the user's theme selection and ensures that
 * LESS stylesheets in packages are compiled to CSS with the theme's
 * variables in the @import path. When the theme changes, the ThemeManager
 * empties it's LESSCache and rebuilds all less stylesheets against the
 * new theme.
 *
 * This class is loosely based on Atom's Theme Manager but:
 *  - Only one theme is active at a time and always overrides ui-light
 *  - Theme packages are never "activated" by the package manager,
 *    they are only placed in the LESS import path.
 *  - ThemeManager directly updates <style> tags when recompiling LESS.
 */
export default class ThemeManager {
  private activeThemePackage = null;
  private baseThemeOnly = false;
  private emitter = new Emitter();
  private styleSheetDisposablesBySourcePath = {};
  private lessCache: LessCompileCache;
  private packageManager: PackageManager;
  private configDirPath: string;
  private resourcePath: string;
  private safeMode: boolean;

  private themeValueCache: { emailTextColor?: string } = {};

  private _systemAccentColor: string | null = null;
  private _systemAccentDisposable: Disposable | null = null;
  private _systemDarkMode: boolean = false;

  constructor({ packageManager, resourcePath, configDirPath, safeMode }) {
    this.packageManager = packageManager;
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.safeMode = safeMode;

    // Prime the system dark-mode state synchronously so the initial theme
    // resolution in activateThemePackage() picks the right light/dark variant
    // without a flash of the wrong theme.
    this._systemDarkMode = !!ipcRenderer.sendSync('get-system-dark-mode-sync');

    this.lessCache = new LessCompileCache({
      configDirPath: this.configDirPath,
      resourcePath: this.resourcePath,
      importPaths: this.getImportPaths(),
    });

    AppEnv.config.onDidChange(CONFIG_THEME_KEY, () => this.updateThemePackageAndRecomputeLESS());
    AppEnv.config.onDidChange(CONFIG_USE_SYSTEM_ACCENT_KEY, () => this.applySystemAccent());

    ipcRenderer.on('system-accent-color-changed', (_event, color: string | null) => {
      this._systemAccentColor = color;
      this.applySystemAccent();
    });
    ipcRenderer.invoke('get-system-accent-color').then((color: string | null) => {
      this._systemAccentColor = color;
      this.applySystemAccent();
    });

    ipcRenderer.on('system-dark-mode-changed', (_event, darkMode: boolean) => {
      this._systemDarkMode = !!darkMode;
      if (this.isAutomaticModeSelected()) {
        this.updateThemePackageAndRecomputeLESS();
      }
    });
  }

  // New users (no `core.theme` saved in config) default to automatic mode so
  // the app follows their OS appearance. Existing users keep whatever they set.
  // In spec/safe mode we fall back to the concrete light theme so headless
  // test environments don't follow the auto-resolution path (which depends on
  // packages like ui-dark/ui-automatic not being present in the spec fixtures).
  private getConfiguredThemeName(): string {
    const configured = AppEnv.config.get(CONFIG_THEME_KEY);
    if (configured) return configured;
    if (this.safeMode || AppEnv.inSpecMode()) return LIGHT_THEME_NAME;
    return AUTOMATIC_THEME_NAME;
  }

  private isAutomaticModeSelected() {
    return !this.baseThemeOnly && this.getConfiguredThemeName() === AUTOMATIC_THEME_NAME;
  }

  // Called from the onboarding window to disable any custom theme
  forceBaseTheme() {
    this.baseThemeOnly = true;
    this.updateThemePackageAndRecomputeLESS();
  }

  updateThemePackageAndRecomputeLESS() {
    this.activateThemePackage();

    if (this.lessCache) {
      this.lessCache.setImportPaths(this.getImportPaths());
    }
    // reload all stylesheets attached to the dom
    for (const styleEl of Array.from(document.head.querySelectorAll('[source-path]'))) {
      if ((styleEl as any).sourcePath.endsWith('.less')) {
        styleEl.textContent = this.cssContentsOfStylesheet((styleEl as any).sourcePath);
      }
    }
    this.emitter.emit('did-change-active-themes');
  }

  reloadCoreStyles() {
    console.log('Reloading /static and /internal_packages to incorporate LESS changes');
    const reloadStylesIn = folder => {
      (fs.readdirSync(folder, { recursive: true }) as string[])
        .map(f => path.join(folder, f))
        .filter(stylePath => stylePath.endsWith('.less'))
        .forEach(stylePath => {
          const styleEl = document.head.querySelector(`[source-path="${stylePath}"]`);
          if (styleEl) styleEl.textContent = this.cssContentsOfStylesheet(stylePath);
        });
    };
    reloadStylesIn(`${this.resourcePath}/static`);
    reloadStylesIn(`${this.resourcePath}/internal_packages`);
  }

  // Essential: Invoke `callback` when style sheet changes associated with
  // updating the list of active themes have completed.
  //
  // * `callback` {Function}
  //
  onDidChangeActiveThemes(callback) {
    return this.emitter.on('did-change-active-themes', callback);
  }

  getBaseTheme() {
    return this.packageManager.getPackageNamed('ui-light');
  }

  getActiveTheme() {
    if (this.baseThemeOnly) {
      return this.getBaseTheme();
    }
    const configured = this.getConfiguredThemeName();
    if (configured === AUTOMATIC_THEME_NAME) {
      const resolvedName = this._systemDarkMode ? DARK_THEME_NAME : LIGHT_THEME_NAME;
      return this.packageManager.getPackageNamed(resolvedName) || this.getBaseTheme();
    }
    return this.packageManager.getPackageNamed(configured) || this.getBaseTheme();
  }

  // Returns the theme the user selected, which may be "ui-automatic" (unresolved).
  getActiveThemeSetting() {
    if (this.baseThemeOnly) {
      return this.getBaseTheme();
    }
    return (
      this.packageManager.getPackageNamed(this.getConfiguredThemeName()) || this.getBaseTheme()
    );
  }

  getAvailableThemes() {
    return this.packageManager.getAvailablePackages().filter(p => p.isTheme());
  }

  // Set the active theme.
  //  * `packageName` {string} - the theme package to activate
  //
  setActiveTheme(packageName) {
    AppEnv.config.set(CONFIG_THEME_KEY, packageName);
    // because we're observing the config, changes will be applied
  }

  activateThemePackage() {
    const next = this.getActiveTheme();
    if (this.activeThemePackage === next) {
      return;
    }

    // Turn off the old active theme and enable the new theme. This
    // allows the theme to have code and random stylesheets of it's own.
    if (this.activeThemePackage) {
      this.activeThemePackage.deactivate();
    }
    next.activate();

    // Update the body classList to include the theme name so plugin
    // developers can alter their plugin's styles based on the theme.
    for (const cls of Array.from(document.body.classList)) {
      if (cls.startsWith('theme-')) {
        document.body.classList.remove(cls);
      }
    }
    document.body.classList.add(`theme-${this.getBaseTheme().name}`);
    document.body.classList.add(`theme-${this.getActiveTheme().name}`);

    this.themeValueCache = {};
    this.activeThemePackage = next;
  }

  getImportPaths() {
    const paths = [this.getBaseTheme().getStylesheetsPath()];
    const active = this.getActiveTheme();
    if (active) {
      paths.unshift(active.getStylesheetsPath());
    }
    return paths;
  }

  // Writes a <style> tag setting the --system-accent CSS custom properties
  // when the user opted into system accent and the OS provided a color.
  // Otherwise removes the tag so per-theme fallbacks in LESS take over.
  applySystemAccent() {
    const enabled = AppEnv.config.get(CONFIG_USE_SYSTEM_ACCENT_KEY) !== false;
    const color = enabled ? this._systemAccentColor : null;

    if (this._systemAccentDisposable) {
      this._systemAccentDisposable.dispose();
      this._systemAccentDisposable = null;
    }
    if (color) {
      this._systemAccentDisposable = AppEnv.styles.addStyleSheet(buildSystemAccentCSS(color), {
        sourcePath: SYSTEM_ACCENT_SOURCE_PATH,
        priority: 2,
      });
    }
  }

  // Section: Private
  // ------

  requireStylesheet(stylesheetPath) {
    const sourcePath = this.resolveStylesheetPath(stylesheetPath);
    if (!sourcePath) {
      throw new Error(localized(`Could not find a file at path '%@'`, stylesheetPath));
    }
    const content = this.cssContentsOfStylesheet(sourcePath);
    this.styleSheetDisposablesBySourcePath[sourcePath] = AppEnv.styles.addStyleSheet(content, {
      priority: -1,
      sourcePath,
    });
  }

  loadStaticStylesheets() {
    this.requireStylesheet('../static/style/index');
    this.requireStylesheet('../static/style/email-frame');
  }

  resolveStylesheetPath(stylesheetPath) {
    if (path.extname(stylesheetPath).length > 0) {
      const p = path.resolve(__dirname, stylesheetPath);
      return fs.existsSync(p) ? p : null;
    }
    for (const ext of ['css', 'less']) {
      const p = path.resolve(__dirname, `${stylesheetPath}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  cssContentsOfStylesheet(stylesheetPath) {
    const ext = path.extname(stylesheetPath);

    if (ext === '.less') {
      return this.cssContentsOfLessStylesheet(stylesheetPath);
    } else if (ext === '.css') {
      return fs.readFileSync(stylesheetPath, 'utf8');
    } else {
      throw new Error(
        localized(`Mailspring does not support stylesheets with the extension: %@`, ext)
      );
    }
  }

  cssContentsOfLessStylesheet(lessStylesheetPath) {
    try {
      const less = fs.readFileSync(lessStylesheetPath, 'utf8').toString();
      return this.lessCache.cssForFile(lessStylesheetPath, less);
    } catch (error) {
      let message = `Error loading Less stylesheet: ${lessStylesheetPath}`;
      let detail = error.message;

      if (error.line !== undefined) {
        message = `Error compiling Less stylesheet: ${lessStylesheetPath}`;
        detail = `Line number: ${error.line}\n${error.message}`;
      }
      console.error(message, { detail, dismissable: true });
      console.error(detail);

      ipcRenderer.send('encountered-theme-error', { message, detail });

      return '';
    }
  }

  // Helpers for theme values

  getEmailTextColor() {
    if (!this.themeValueCache.emailTextColor) {
      // Quite surprising that Chrome is cool with this...
      const innerBodyEl = document.createElement('body');
      const wrapEl = document.createElement('span');
      wrapEl.className = 'ignore-in-parent-frame';
      wrapEl.appendChild(innerBodyEl);
      document.body.appendChild(wrapEl);

      const style = window.getComputedStyle(innerBodyEl);
      this.themeValueCache.emailTextColor = style.getPropertyValue('color');
      wrapEl.remove();
    }
    return this.themeValueCache.emailTextColor;
  }
}
