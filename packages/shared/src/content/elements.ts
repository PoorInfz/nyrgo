import { ELEMENTS, type Element } from '../domain.js';

/** Display names and colours. Internal ids stay generic; the theme lives in the names. */
export const ELEMENT_INFO: Record<Element, { es: string; en: string; color: string }> = {
  water: { es: 'Liquidez', en: 'Liquidity', color: '#38bdf8' },
  fire: { es: 'Quema', en: 'Burn', color: '#f97316' },
  nature: { es: 'Farming', en: 'Yield', color: '#4ade80' },
  earth: { es: 'Minado', en: 'Mining', color: '#a8a29e' },
  electric: { es: 'Gas', en: 'Gas', color: '#facc15' },
  wind: { es: 'Airdrop', en: 'Airdrop', color: '#a5f3fc' },
  ice: { es: 'Frío', en: 'Cold', color: '#bfdbfe' },
  cosmic: { es: 'Luna', en: 'Moon', color: '#c4b5fd' },
  light: { es: 'Oráculo', en: 'Oracle', color: '#fde68a' },
  shadow: { es: 'FUD', en: 'FUD', color: '#7c3aed' },
};

/**
 * Each element deals double damage to exactly two others and takes double from exactly two.
 * Built on a ring (water, fire, nature, earth, electric, wind, ice, cosmic, light, shadow):
 * every element beats the next one and the one three places ahead, so the chart is balanced by
 * construction. Approved in the creature proposal of 2026-10-29.
 */
export const STRONG_AGAINST: Record<Element, readonly [Element, Element]> = {
  water: ['fire', 'earth'],
  fire: ['nature', 'electric'],
  nature: ['earth', 'wind'],
  earth: ['electric', 'ice'],
  electric: ['wind', 'cosmic'],
  wind: ['ice', 'light'],
  ice: ['cosmic', 'shadow'],
  cosmic: ['light', 'water'],
  light: ['shadow', 'fire'],
  shadow: ['water', 'nature'],
};

export const SUPER_EFFECTIVE = 2;
export const NOT_EFFECTIVE = 0.5;

/** Damage multiplier when `attacker`'s element hits `defender`'s element. */
export function effectiveness(attacker: Element, defender: Element): number {
  if (STRONG_AGAINST[attacker].includes(defender)) return SUPER_EFFECTIVE;
  if (STRONG_AGAINST[defender].includes(attacker)) return NOT_EFFECTIVE;
  return 1;
}

/** The full 10×10 chart, rows = attacker, columns = defender, in ELEMENTS order. */
export function effectivenessMatrix(): number[][] {
  return ELEMENTS.map((a) => ELEMENTS.map((d) => effectiveness(a, d)));
}

export function weakAgainst(e: Element): Element[] {
  return ELEMENTS.filter((other) => STRONG_AGAINST[other].includes(e));
}
