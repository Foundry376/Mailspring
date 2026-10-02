import { hostsFor } from './hosts';
import { ViewDiagnostics } from './diagnostics';

/**
 * Captures what a View is showing, without the host's chrome, for an authoring loop to look
 * at alongside its diagnostics. Captures stay on this machine: nothing here sends them
 * anywhere, and the diagnostic record notes only that one was taken. Whether and when a
 * preview leaves the device is a decision for the authoring UI, with the user's consent,
 * because it shows their mail.
 */
export async function captureViewPreview(viewId: string, { maxWidth }: { maxWidth?: number } = {}) {
  const host = hostsFor(viewId)[0];
  let image = host ? await host.capturePage() : null;
  if (!image || image.isEmpty()) {
    throw new Error(`View "${viewId}" isn't on screen.`);
  }
  if (maxWidth && image.getSize().width > maxWidth) {
    image = image.resize({ width: maxWidth, quality: 'good' });
  }
  const { width, height } = image.getSize();
  ViewDiagnostics.add({
    viewId,
    kind: 'screenshot-taken',
    message: `Captured a ${width}×${height} preview.`,
  });
  return { png: image.toPNG(), width, height };
}
