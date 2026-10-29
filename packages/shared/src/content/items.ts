import type { Rarity } from '../domain.js';

export type ItemKind = 'capture' | 'heal' | 'revive' | 'material' | 'lure';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  rarity: Rarity;
  /** Gold price in the shop; null when it can only be found or crafted. */
  price: number | null;
  effects: Record<string, number>;
  name: { es: string; en: string };
  text: { es: string; en: string };
}

const I = (
  id: string,
  kind: ItemKind,
  rarity: Rarity,
  price: number | null,
  effects: Record<string, number>,
  es: [string, string],
  en: [string, string],
): ItemDef => ({
  id,
  kind,
  rarity,
  price,
  effects,
  name: { es: es[0], en: en[0] },
  text: { es: es[1], en: en[1] },
});

/** Capture is "storing the creature in a vault": no ball-style devices. */
export const ITEMS: ItemDef[] = [
  I(
    'vault-basic',
    'capture',
    'common',
    20,
    { captureMultiplier: 1 },
    ['Bóveda básica', 'Guarda una criatura en tu colección.'],
    ['Basic Vault', 'Stores a creature in your collection.'],
  ),
  I(
    'vault-reinforced',
    'capture',
    'uncommon',
    60,
    { captureMultiplier: 1.5 },
    ['Bóveda reforzada', 'Más difícil de forzar desde dentro.'],
    ['Reinforced Vault', 'Harder to break out of.'],
  ),
  I(
    'vault-cold',
    'capture',
    'rare',
    150,
    { captureMultiplier: 2 },
    ['Bóveda fría', 'La más segura. Nada sale de aquí.'],
    ['Cold Vault', 'The safest one. Nothing gets out.'],
  ),
  I(
    'patch',
    'heal',
    'common',
    30,
    { heal: 30 },
    ['Parche', 'Recupera 30 PS.'],
    ['Patch', 'Restores 30 HP.'],
  ),
  I(
    'patch-secure',
    'heal',
    'uncommon',
    70,
    { heal: 80 },
    ['Parche de seguridad', 'Recupera 80 PS.'],
    ['Security Patch', 'Restores 80 HP.'],
  ),
  I(
    'node-restart',
    'revive',
    'uncommon',
    80,
    { reviveFraction: 0.5 },
    ['Reinicio de nodo', 'Revive con la mitad de PS.'],
    ['Node Restart', 'Revives with half HP.'],
  ),
  I(
    'hash-shard',
    'material',
    'uncommon',
    null,
    {},
    ['Fragmento de hash', 'Material de evolución para Gas, Minado y Quema.'],
    ['Hash Shard', 'Evolution material for Gas, Mining and Burn.'],
  ),
  I(
    'moon-dust',
    'material',
    'uncommon',
    null,
    {},
    ['Polvo lunar', 'Material de evolución para Luna, Airdrop y Oráculo.'],
    ['Moon Dust', 'Evolution material for Moon, Airdrop and Oracle.'],
  ),
  I(
    'vault-frost',
    'material',
    'uncommon',
    null,
    {},
    ['Escarcha de bóveda', 'Material de evolución para Frío y Liquidez.'],
    ['Vault Frost', 'Evolution material for Cold and Liquidity.'],
  ),
  I(
    'yield-seed',
    'material',
    'uncommon',
    null,
    {},
    ['Semilla de rendimiento', 'Material de evolución para Farming y FUD.'],
    ['Yield Seed', 'Evolution material for Yield and FUD.'],
  ),
  I(
    'mempool-bait',
    'lure',
    'rare',
    null,
    { minutes: 10 },
    ['Cebo de mempool', 'Atrae una criatura común durante 10 minutos.'],
    ['Mempool Bait', 'Attracts a common creature for 10 minutes.'],
  ),
];

export interface RecipeDef {
  id: string;
  output: string;
  inputs: Record<string, number>;
  gold: number;
  unlockLevel: number;
}

export const RECIPES: RecipeDef[] = [
  {
    id: 'craft-vault-reinforced',
    output: 'vault-reinforced',
    inputs: { 'vault-basic': 2, 'hash-shard': 1 },
    gold: 30,
    unlockLevel: 5,
  },
  {
    id: 'craft-vault-cold',
    output: 'vault-cold',
    inputs: { 'vault-reinforced': 2, 'vault-frost': 2 },
    gold: 80,
    unlockLevel: 12,
  },
  {
    id: 'craft-patch-secure',
    output: 'patch-secure',
    inputs: { patch: 2, 'yield-seed': 1 },
    gold: 20,
    unlockLevel: 3,
  },
  {
    id: 'craft-node-restart',
    output: 'node-restart',
    inputs: { 'patch-secure': 1, 'hash-shard': 2 },
    gold: 50,
    unlockLevel: 8,
  },
  {
    id: 'craft-mempool-bait',
    output: 'mempool-bait',
    inputs: { 'moon-dust': 2, 'yield-seed': 2 },
    gold: 100,
    unlockLevel: 10,
  },
];

export const ITEMS_BY_ID: ReadonlyMap<string, ItemDef> = new Map(ITEMS.map((i) => [i.id, i]));
