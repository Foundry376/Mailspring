import { nativeImage } from 'electron';
import { ViewPlacement } from '../view-host';
import { LIGHT_THEME_TOKENS } from '../theme-tokens';
import { renderMockScreenshot } from '../mock/mock-render';
import { PAGE_RENDER, SIDEBAR_RENDER, frameSidebar } from '../home/starter-posters';

type Size = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

/** The share route's poster sizes: the Open Graph image and the landing page's card. */
export const POSTER_SIZES: { og: Size; card: Size } = {
  og: { width: 1200, height: 630 },
  card: { width: 640, height: 272 },
};
// The backend refuses larger posters.
const MAX_POSTER_BYTES = 1.5 * 1024 * 1024;

export interface PosterPlan {
  /** The CSS size the View is rendered at, once for both posters. */
  render: Size;
  /** Per poster: the page-sized area (CSS px) it shows, scaled to the poster's exact size. */
  og: Size;
  card: Size;
}

/**
 * Both posters come from one render, as starter posters do: page Views at PAGE_RENDER's width
 * and tall enough for the Open Graph image's shape, with the card showing the top of it;
 * sidebar Views at sidebar width, framed on a page of each poster's shape.
 */
export function posterPlan(placement: ViewPlacement): PosterPlan {
  const { width } = PAGE_RENDER;
  const og = {
    width,
    height: Math.round((width * POSTER_SIZES.og.height) / POSTER_SIZES.og.width),
  };
  const card = {
    width,
    height: Math.round((width * POSTER_SIZES.card.height) / POSTER_SIZES.card.width),
  };
  const render = placement === 'page' ? og : { width: SIDEBAR_RENDER.width, height: og.height };
  return { render, og, card };
}

/**
 * Crops `image` (captured at `cssWidth` CSS px, at any device scale) to `area` and scales the
 * result to exactly `size`, as PNG bytes.
 */
export function cropToPoster(
  image: Electron.NativeImage,
  cssWidth: number,
  area: Rect,
  size: Size
) {
  const scale = image.getSize().width / cssWidth;
  const cropped = image.crop({
    x: Math.round(area.x * scale),
    y: Math.round(area.y * scale),
    width: Math.round(area.width * scale),
    height: Math.round(area.height * scale),
  });
  const png = cropped.resize({ ...size, quality: 'best' }).toPNG();
  if (png.length > MAX_POSTER_BYTES) {
    throw new Error(`The ${size.width}×${size.height} poster is larger than 1.5 MB.`);
  }
  return png;
}

// Views may leave their background transparent; the poster is always on the light page.
async function onBackground(image: Electron.NativeImage) {
  const { width, height } = image.getSize();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = LIGHT_THEME_TOKENS.colors.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(await createImageBitmap(new Blob([image.toPNG()], { type: 'image/png' })), 0, 0);
  return nativeImage.createFromDataURL(canvas.toDataURL('image/png'));
}

/**
 * Renders the View from its mock-data.json in the light theme and returns both share posters
 * as base64 PNGs. Nothing of the user's mail is in them (see renderMockScreenshot).
 */
export async function renderSharePosters(viewId: string, placement: ViewPlacement) {
  const plan = posterPlan(placement);
  const capture = await renderMockScreenshot(viewId, {
    ...plan.render,
    placement,
    theme: LIGHT_THEME_TOKENS,
  });
  const origin = { x: 0, y: 0 };
  let og: Buffer;
  let card: Buffer;
  if (placement === 'page') {
    const page = await onBackground(capture);
    og = cropToPoster(page, plan.render.width, { ...origin, ...plan.og }, POSTER_SIZES.og);
    card = cropToPoster(page, plan.render.width, { ...origin, ...plan.card }, POSTER_SIZES.card);
  } else {
    const ogFrame = await frameSidebar(capture, LIGHT_THEME_TOKENS, plan.og);
    const cardFrame = await frameSidebar(capture, LIGHT_THEME_TOKENS, plan.card);
    og = cropToPoster(ogFrame, plan.og.width, { ...origin, ...plan.og }, POSTER_SIZES.og);
    card = cropToPoster(cardFrame, plan.card.width, { ...origin, ...plan.card }, POSTER_SIZES.card);
  }
  return { og: og.toString('base64'), card: card.toString('base64') };
}
