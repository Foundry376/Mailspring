import React from 'react';
import ReactDOM from 'react-dom';
import { installedViews } from '../view-registry';
import { ViewHost, ViewPlacement } from '../view-host';
import { MockSource } from './mock-bridge';
import { loadMockData } from './mock-data';

// The page has mounted by now; this leaves time for subscription snapshots, AI results and
// chart animations to arrive before the capture.
const SETTLE_MS = 2500;
const MOUNT_TIMEOUT_MS = 20000;

export interface MockRenderOptions {
  /** CSS pixels. The image is captured at the window's device scale. */
  width: number;
  height: number;
  placement?: ViewPlacement;
  settleMs?: number;
}

/**
 * Renders a View from its mock-data.json and returns a screenshot of it. Nothing of the user's
 * mail reaches the View: it runs in an offline, in-memory session (view-sessions.ts) against a
 * bridge that only knows the mock data (mock-bridge.ts). This is how a View gets a picture for
 * its starter card or a share link without anyone seeing real mail.
 *
 * The host is mounted for real but behind the workspace, because Chromium doesn't paint a
 * guest that is off screen.
 */
export async function renderMockScreenshot(
  viewId: string,
  { width, height, placement, settleMs = SETTLE_MS }: MockRenderOptions
): Promise<Electron.NativeImage> {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) throw new Error(`No View "${viewId}" is installed.`);
  const source = new MockSource(viewId, view.permissions, loadMockData(view.dir));

  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    zIndex: '-1',
    pointerEvents: 'none',
  });
  document.body.appendChild(container);

  let host: ViewHost = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`"${viewId}" didn't render from mock data within 20 seconds.`)),
        MOUNT_TIMEOUT_MS
      );
      const onMockDiagnostic = (d: any) => {
        if (d.kind === 'mounted') {
          clearTimeout(timer);
          resolve();
        } else if (['compile-error', 'runtime-error', 'crash'].includes(d.kind)) {
          clearTimeout(timer);
          reject(new Error(`"${viewId}" failed in mock mode: ${d.message}`));
        } else if (d.kind === 'bridge-error') {
          console.warn(`Views: mock render of ${viewId}: ${d.method}: ${d.message}`);
        }
      };
      ReactDOM.render(
        <ViewHost
          ref={(el) => (host = el)}
          viewId={viewId}
          placement={placement || view.placement}
          mock={source}
          onMockDiagnostic={onMockDiagnostic}
          style={{ width, height }}
        />,
        container
      );
    });
    await new Promise((r) => setTimeout(r, settleMs));
    const image = host && (await host.capturePage());
    if (!image || image.isEmpty()) throw new Error(`"${viewId}" produced an empty capture.`);
    return image;
  } finally {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  }
}
