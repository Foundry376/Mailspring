import fs from 'fs';
import path from 'path';
import { nativeImage } from 'electron';
import { ViewTheme, currentThemeTokens } from '../theme-tokens';
import { notifyViewsChanged } from '../view-registry';
import { deleteViewFiles } from '../authoring/revisions';
import { renderMockScreenshot } from '../mock/mock-render';
import { STARTER_POSTER_FILE, installStarter, listStarters } from './starters';

// Twice the card's image box (views-home.less: ~320 × 136 CSS px at the usual window size),
// so it's sharp on Retina screens and the card never crops it.
const POSTER = { width: 640, height: 272 };
// Page Views render at a desktop width and are scaled down to the poster. Sidebar Views
// render at sidebar width and are framed as a card in the middle of a page-sized image, so
// they appear at the same scale as page Views.
export const PAGE_RENDER = { width: 960, height: 408 };
export const SIDEBAR_RENDER = { width: 300, height: 408 };

/**
 * Draws a sidebar View's capture (rendered SIDEBAR_RENDER.width wide) as a bordered card
 * centered on a `page`-sized background, in CSS px. The card runs off the bottom edge.
 */
export async function frameSidebar(
  image: Electron.NativeImage,
  theme: ViewTheme = currentThemeTokens(),
  page: { width: number; height: number } = PAGE_RENDER
) {
  const { colors } = theme;
  const scale = image.getSize().width / SIDEBAR_RENDER.width;
  const canvas = document.createElement('canvas');
  canvas.width = page.width * scale;
  canvas.height = page.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bitmap = await createImageBitmap(new Blob([image.toPNG()], { type: 'image/png' }));
  // The sidebar card's own padding (message-list.less `.sidebar-section`) surrounds the View.
  const pad = 12 * scale;
  const x = (canvas.width - bitmap.width) / 2;
  const y = 16 * scale + pad;
  ctx.fillStyle = colors.panel;
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = scale;
  ctx.beginPath();
  ctx.roundRect(x - pad, y - pad, bitmap.width + pad * 2, canvas.height, 8 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(bitmap, x, y);
  return nativeImage.createFromDataURL(canvas.toDataURL('image/png'));
}

/**
 * Regenerates the poster (`poster.png`) for every starter from its mock-data.json. Development
 * only: the images ship with the app. Each starter is copied to a temporary View so its files
 * are served, rendered from mock data, and deleted. `$m.ViewAuthoring.regenerateStarterPosters()`.
 */
export async function regenerateStarterPosters(only?: string[]) {
  const results: { [starterId: string]: string } = {};
  for (const starter of listStarters()) {
    if (only && !only.includes(starter.id)) continue;
    const viewId = installStarter(starter);
    try {
      const page = starter.placement === 'page';
      let image = await renderMockScreenshot(viewId, page ? PAGE_RENDER : SIDEBAR_RENDER);
      if (!page) image = await frameSidebar(image);
      const png = image.resize({ ...POSTER, quality: 'best' }).toPNG();
      fs.writeFileSync(path.join(starter.dir, STARTER_POSTER_FILE), png);
      results[starter.id] = 'ok';
    } catch (err) {
      results[starter.id] = err.message;
    } finally {
      deleteViewFiles(viewId);
      notifyViewsChanged([viewId], true);
    }
  }
  return results;
}
