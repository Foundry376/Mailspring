import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { hostsFor } from '../authoring/hosts';
import { allViews } from '../view-registry';
import { Diagnostic, ViewDiagnostics } from '../authoring/diagnostics';

// render-ok fires once the View mounts without errors, usually before its subscriptions have
// delivered data. Waiting a little longer captures the View populated instead of a spinner.
const SETTLE_MS = 4000;
// A View seen for the first time gets a quick capture too, so leaving right away still leaves a
// thumbnail; the settled capture replaces it if the user stays.
const FIRST_CAPTURE_MS = 600;
const THUMBNAIL_WIDTH = 640;
// Chromium's classic scrollbar is 15 CSS px wide on macOS and 17 on Windows. Views usually
// scroll a full-height element, so its scrollbar runs down the right edge; trimming this much
// removes it, and costs nothing visible where scrollbars overlay content.
const SCROLLBAR_GUTTER_PX = 17;

export const ThumbnailEvents = new EventEmitter();

export function thumbnailsDir() {
  return path.join(AppEnv.getConfigDirPath(), 'views-thumbnails');
}

export function thumbnailPath(viewId: string) {
  return path.join(thumbnailsDir(), `${viewId}.png`);
}

export function removeThumbnail(viewId: string) {
  fs.rmSync(thumbnailPath(viewId), { force: true });
}

/**
 * The thumbnail on a View's home card: its own pixels shortly after it last rendered cleanly.
 * This reads the host directly rather than through captureViewPreview, which records a
 * `screenshot-taken` diagnostic; these captures are a local cache for the home and must not
 * look, in a View's diagnostics, like something an authoring agent was sent.
 */
async function capture(viewId: string) {
  const host = hostsFor(viewId)[0];
  const cssWidth = host ? host.viewportWidth() : 0;
  let image = host ? await host.capturePage() : null;
  if (!image || image.isEmpty()) return;
  const { width, height } = image.getSize();
  const gutter = cssWidth > 0 ? Math.round((SCROLLBAR_GUTTER_PX * width) / cssWidth) : 0;
  if (gutter > 0 && gutter < width / 4) {
    image = image.crop({ x: 0, y: 0, width: width - gutter, height });
  }
  if (image.getSize().width > THUMBNAIL_WIDTH) {
    image = image.resize({ width: THUMBNAIL_WIDTH, quality: 'good' });
  }
  fs.mkdirSync(thumbnailsDir(), { recursive: true });
  fs.writeFileSync(thumbnailPath(viewId), image.toPNG());
  ThumbnailEvents.emit('changed', viewId);
}

/**
 * Captures a thumbnail after each clean render, plus a quick one when a View without a
 * thumbnail first renders. Returns an unsubscribe.
 */
export function captureThumbnailsOnRender() {
  const timers = new Map<string, NodeJS.Timeout>();
  // A sidebar View's capture is a narrow strip about whichever thread happened to be open;
  // its card shows the placeholder icon instead.
  const isPage = (viewId: string) => {
    const view = allViews().find((v) => v.id === viewId);
    return !!view && view.placement === 'page';
  };
  const schedule = (viewId: string, delay: number, onlyIfMissing: boolean) => {
    clearTimeout(timers.get(viewId));
    timers.set(
      viewId,
      setTimeout(() => {
        timers.delete(viewId);
        if (onlyIfMissing && fs.existsSync(thumbnailPath(viewId))) return;
        capture(viewId).catch((err) =>
          console.warn(`Views: thumbnail for ${viewId} failed: ${err.message}`)
        );
      }, delay)
    );
  };
  const onMounted = (viewId: string) => {
    if (isPage(viewId)) schedule(viewId, FIRST_CAPTURE_MS, true);
  };
  const onDiagnostic = (d: Diagnostic) => {
    if (d.kind === 'render-ok' && isPage(d.viewId)) schedule(d.viewId, SETTLE_MS, false);
  };
  ViewDiagnostics.on('mounted', onMounted);
  ViewDiagnostics.on('diagnostic', onDiagnostic);
  return () => {
    ViewDiagnostics.removeListener('mounted', onMounted);
    ViewDiagnostics.removeListener('diagnostic', onDiagnostic);
    timers.forEach((t) => clearTimeout(t));
  };
}
