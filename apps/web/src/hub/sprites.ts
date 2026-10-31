import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { AvatarLook, HubGround, HubSprite } from '@nyrgo/shared';
import { Avatar } from '../avatar/Avatar';

/**
 * Images for the town's canvas, loaded once and cached: the owner's town art, the creatures'
 * sprite sheets for companions, and explorers rasterised from the same SVG avatar the rest of
 * the game uses (three walking poses per look).
 */

const cache = new Map<string, HTMLImageElement>();

export function image(src: string): HTMLImageElement {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = src;
    cache.set(src, img);
  }
  return img;
}

export const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

export const townSprite = (name: HubSprite) => image(`/hub/${name}.webp`);
export const groundImage = (name: HubGround) => image(`/hub/ground-${name}.webp`);
/** A creature's 6-frame idle sheet. */
export const companionSheet = (id: string) => image(`/sprites/${id}-idle.webp`);

/** Avatar size on the canvas, in world pixels (the SVG's 100×140 box). */
export const EXPLORER = { w: 40, h: 56 } as const;
/**
 * Room kept above the figure's box when it is turned into an image, for tall hats that rise
 * over it (an image is cut at its box), in the SVG's units.
 */
export const EXPLORER_HEADROOM = 40;

const explorers = new Map<string, HTMLImageElement[]>();

function svgMarkup(look: AvatarLook, pose: -1 | 0 | 1): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => {
    root.render(createElement(Avatar, { look, pose, size: 100 }));
  });
  const svg = host.querySelector('svg');
  if (svg) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.removeAttribute('class');
    svg.setAttribute('viewBox', `0 ${-EXPLORER_HEADROOM} 100 ${140 + EXPLORER_HEADROOM}`);
    svg.setAttribute('width', '100');
    svg.setAttribute('height', String(140 + EXPLORER_HEADROOM));
  }
  const markup = svg?.outerHTML ?? '';
  queueMicrotask(() => root.unmount());
  return markup;
}

/** The three poses of an explorer: standing, left foot forward, right foot forward. */
export function explorerFrames(look: AvatarLook): HTMLImageElement[] {
  const key = JSON.stringify(look);
  let frames = explorers.get(key);
  if (!frames) {
    frames = ([0, -1, 1] as const).map((pose) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup(look, pose))}`;
      return img;
    });
    explorers.set(key, frames);
  }
  return frames;
}
