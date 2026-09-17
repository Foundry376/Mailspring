import fs from 'fs';
import path from 'path';

type RecoveryApp = {
  disableHardwareAcceleration(): void;
  relaunch(): void;
  exit(code?: number): void;
};

type RecoveryFileSystem = Pick<typeof fs, 'existsSync' | 'rmSync' | 'writeFileSync'>;

/**
 * Some Windows GPU driver combinations crash Chromium's renderer before the
 * first window ever paints, which leaves Mailspring as a tray icon with no UI
 * and no way for the user to reach the setting that would fix it. When that
 * happens we record a marker in the config directory, relaunch, and start with
 * hardware acceleration disabled from then on.
 *
 * The marker is deliberately permanent: re-enabling the GPU on a later launch
 * reproduces the crash and, on affected machines, re-corrupts Chromium's GPU
 * shader cache. Deleting the marker file re-enables acceleration.
 */
const SOFTWARE_RENDERING_MARKER = 'disable-hardware-acceleration';
const CACHE_CLEARED_MARKER = 'software-rendering-cache-cleared';

// Chromium cache directories under userData that a GPU crash can leave in a
// state that crashes the next launch too. Cleared once after recovery.
const CHROMIUM_CACHE_DIRECTORIES = ['GPUCache', 'Code Cache', 'Cache'];

// render-process-gone reasons that indicate the renderer died on its own.
// 'clean-exit' and 'killed' are normal teardown; 'oom' is not a GPU problem.
const RECOVERABLE_EXIT_REASONS = new Set(['crashed', 'abnormal-exit', 'launch-failed']);

let recoveryStarted = false;

export function softwareRenderingMarkerPath(configDirPath: string) {
  return path.join(configDirPath, SOFTWARE_RENDERING_MARKER);
}

export function shouldRecoverFromEarlyRendererCrash({
  platform,
  primaryWindow,
  loaded,
  reason,
}: {
  platform: string;
  primaryWindow: boolean;
  loaded: boolean;
  reason: string;
}) {
  return platform === 'win32' && primaryWindow && !loaded && RECOVERABLE_EXIT_REASONS.has(reason);
}

// The main window, or onboarding on a fresh install, is the window whose loss
// leaves the user with nothing. Secondary windows crashing are handled by the
// regular reload dialog.
export function isPrimaryWindow({
  mainWindow,
  windowType,
}: {
  mainWindow: boolean;
  windowType: string;
}) {
  return !!mainWindow || windowType === 'onboarding';
}

/**
 * Called from render-process-gone. Returns true if a relaunch has been
 * requested and the caller should not show its crash dialog.
 */
export function attemptEarlyRendererCrashRecovery({
  app,
  configDirPath,
  loaded,
  primaryWindow,
  reason,
  platform = process.platform,
  fileSystem = fs,
}: {
  app: RecoveryApp;
  configDirPath: string;
  loaded: boolean;
  primaryWindow: boolean;
  reason: string;
  platform?: string;
  fileSystem?: RecoveryFileSystem;
}) {
  if (
    recoveryStarted ||
    !shouldRecoverFromEarlyRendererCrash({ platform, primaryWindow, loaded, reason })
  ) {
    return false;
  }

  recoveryStarted = true;
  console.warn(
    `Renderer exited (${reason}) before the primary window loaded; relaunching with hardware acceleration disabled.`
  );
  fileSystem.writeFileSync(
    softwareRenderingMarkerPath(configDirPath),
    `Renderer startup failure (${reason}) at ${new Date().toISOString()}\n`
  );
  app.relaunch();
  app.exit(0);
  return true;
}

/**
 * Must run before Electron's `ready` event. Applies software rendering when a
 * previous launch recorded the marker, and clears Chromium's caches the first
 * time it does so. Returns whether software rendering was applied.
 */
export function applyPersistentSoftwareRendering(
  app: RecoveryApp,
  configDirPath: string,
  platform = process.platform,
  fileSystem: RecoveryFileSystem = fs
) {
  if (platform !== 'win32' || !fileSystem.existsSync(softwareRenderingMarkerPath(configDirPath))) {
    return false;
  }

  app.disableHardwareAcceleration();

  const cacheClearedPath = path.join(configDirPath, CACHE_CLEARED_MARKER);
  if (!fileSystem.existsSync(cacheClearedPath)) {
    for (const cacheName of CHROMIUM_CACHE_DIRECTORIES) {
      try {
        fileSystem.rmSync(path.join(configDirPath, cacheName), { recursive: true, force: true });
      } catch (error) {
        // Best effort: software rendering is the recovery step that matters.
        console.warn(`Unable to clear ${cacheName} during GPU recovery: ${error.message}`);
      }
    }
    fileSystem.writeFileSync(cacheClearedPath, `${new Date().toISOString()}\n`);
  }
  return true;
}

export function resetRecoveryStateForTests() {
  recoveryStarted = false;
}
