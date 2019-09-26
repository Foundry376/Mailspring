import { ipcRenderer } from 'electron';
import { Emitter } from 'event-kit';
import path from 'path';
import fs from 'fs-plus';
import { localized } from './intl';
import LessCompileCache from './less-compile-cache';
import PackageManager from './package-manager';

const CONFIG_THEME_KEY = 'core.theme';

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

  constructor({ packageManager, resourcePath, configDirPath, safeMode }) {
    this.packageManager = packageManager;
    this.resourcePath = resourcePath;
    this.configDirPath = configDirPath;
    this.safeMode = safeMode;
    this.lessCache = new LessCompileCache({
      configDirPath: this.configDirPath,
      resourcePath: this.resourcePath,
      importPaths: this.getImportPaths(),
    });

    AppEnv.config.onDidChange(CONFIG_THEME_KEY, () => this.updateThemePackageAndRecomputeLESS());
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
      fs.listTreeSync(folder)
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
    return (
      this.packageManager.getPackageNamed(AppEnv.config.get(CONFIG_THEME_KEY)) ||
      this.getBaseTheme()
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
      return fs.resolveOnLoadPath(stylesheetPath);
    }
    return fs.resolveOnLoadPath(stylesheetPath, ['css', 'less']);
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
      let less = fs.readFileSync(lessStylesheetPath, 'utf8').toString();
      return this.lessCache.cssForFile(lessStylesheetPath, less);
    } catch (error) {
      let message = `Error loading Less stylesheet: ${lessStylesheetPath}`;
      let detail = error.message;

      if (error.line !== undefined) {
        message = `Error compiling Less stylesheet: ${lessStylesheetPath}`;
        detail = `
          Line number: ${error.line}
          ${error.message}
        `;
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
