import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { hostsFor } from '../authoring/hosts';
import { installedViews } from '../view-registry';
import { Diagnostic, ViewDiagnostics } from '../authoring/diagnostics';

// render-ok fires once the View mounts without errors, usually before its subscriptions have
// delivered data. Waiting a little longer captures the View populated instead of a spinner.
const SETTLE_MS = 4000;
const THUMBNAIL_WIDTH = 640;

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
  let image = host ? await host.capturePage() : null;
  if (!image || image.isEmpty()) return;
  if (image.getSize().width > THUMBNAIL_WIDTH) {
    image = image.resize({ width: THUMBNAIL_WIDTH, quality: 'good' });
  }
  fs.mkdirSync(thumbnailsDir(), { recursive: true });
  fs.writeFileSync(thumbnailPath(viewId), image.toPNG());
  ThumbnailEvents.emit('changed', viewId);
}

/** Captures a thumbnail after each clean render. Returns an unsubscribe. */
export function captureThumbnailsOnRender() {
  const timers = new Map<string, NodeJS.Timeout>();
  const onDiagnostic = (d: Diagnostic) => {
    if (d.kind !== 'render-ok') return;
    // A sidebar View's capture is a narrow strip about whichever thread happened to be open;
    // its card shows the placeholder icon instead.
    const view = installedViews().find((v) => v.id === d.viewId);
    if (!view || view.placement !== 'page') return;
    clearTimeout(timers.get(d.viewId));
    timers.set(
      d.viewId,
      setTimeout(() => {
        timers.delete(d.viewId);
        capture(d.viewId).catch((err) =>
          console.warn(`Views: thumbnail for ${d.viewId} failed: ${err.message}`)
        );
      }, SETTLE_MS)
    );
  };
  ViewDiagnostics.on('diagnostic', onDiagnostic);
  return () => {
    ViewDiagnostics.removeListener('diagnostic', onDiagnostic);
    timers.forEach((t) => clearTimeout(t));
  };
}
