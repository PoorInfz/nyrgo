import type { Element } from '../domain.js';

export interface Skill {
  id: string;
  element: Element;
  /** Base power before stats and effectiveness; tiers 40 / 60 / 80 / 100. */
  power: number;
  /** Chance to hit, 0–100. Stronger skills are less reliable. */
  accuracy: number;
  name: { es: string; en: string };
}

type Row = [id: string, es: string, en: string];

/** Four skills per element, weakest first. Combat (milestone 7) reads power and accuracy. */
const ROWS: Record<Element, [Row, Row, Row, Row]> = {
  water: [
    ['liquidity-splash', 'Salpicadura de liquidez', 'Liquidity Splash'],
    ['limit-order', 'Orden límite', 'Limit Order'],
    ['whale-tide', 'Marea de ballena', 'Whale Tide'],
    ['pool-drain', 'Vaciado de piscina', 'Pool Drain'],
  ],
  fire: [
    ['burn-spark', 'Chispa de quema', 'Burn Spark'],
    ['green-candles', 'Velas verdes', 'Green Candles'],
    ['mass-burn', 'Quema masiva', 'Mass Burn'],
    ['euphoria-blaze', 'Llamarada de euforia', 'Euphoria Blaze'],
  ],
  nature: [
    ['sprout', 'Brote', 'Sprout'],
    ['harvest', 'Cosecha', 'Harvest'],
    ['stake-lock', 'Bloqueo de staking', 'Stake Lock'],
    ['compound-yield', 'Interés compuesto', 'Compound Yield'],
  ],
  earth: [
    ['block-slam', 'Golpe de bloque', 'Block Slam'],
    ['proof-of-work', 'Prueba de trabajo', 'Proof of Work'],
    ['hash-avalanche', 'Avalancha de hash', 'Hash Avalanche'],
    ['genesis-quake', 'Terremoto génesis', 'Genesis Quake'],
  ],
  electric: [
    ['base-fee', 'Tarifa base', 'Base Fee'],
    ['priority-tip', 'Propina prioritaria', 'Priority Tip'],
    ['gas-war', 'Guerra de gas', 'Gas War'],
    ['liquidation', 'Liquidación', 'Liquidation'],
  ],
  wind: [
    ['gift-shower', 'Lluvia de regalos', 'Gift Shower'],
    ['claim-rush', 'Carrera por reclamar', 'Claim Rush'],
    ['airdrop-gust', 'Ráfaga de airdrop', 'Airdrop Gust'],
    ['token-storm', 'Tormenta de tokens', 'Token Storm'],
  ],
  ice: [
    ['cold-key', 'Clave fría', 'Cold Key'],
    ['freeze-funds', 'Congelar fondos', 'Freeze Funds'],
    ['crypto-winter', 'Invierno cripto', 'Crypto Winter'],
    ['glacial-vault', 'Bóveda glacial', 'Glacial Vault'],
  ],
  cosmic: [
    ['wen-moon', '¿Wen moon?', 'Wen Moon?'],
    ['countdown', 'Cuenta atrás', 'Countdown'],
    ['moonshot-launch', 'Lanzamiento lunar', 'Moonshot Launch'],
    ['lunar-halving', 'Halving lunar', 'Lunar Halving'],
  ],
  light: [
    ['gm-ray', 'Rayo de buenos días', 'GM Ray'],
    ['verify', 'Verificación', 'Verify'],
    ['oracle-proof', 'Prueba de oráculo', 'Oracle Proof'],
    ['consensus-beam', 'Haz de consenso', 'Consensus Beam'],
  ],
  shadow: [
    ['rumor', 'Rumor', 'Rumor'],
    ['panic-sell', 'Venta de pánico', 'Panic Sell'],
    ['rug-pull', 'Tirón de alfombra', 'Rug Pull'],
    ['phishing', 'Phishing', 'Phishing'],
  ],
};

const POWER = [40, 60, 80, 100] as const;
const ACCURACY = [100, 95, 90, 85] as const;

export const SKILLS: Skill[] = (Object.keys(ROWS) as Element[]).flatMap((element) =>
  ROWS[element].map(([id, es, en], tier) => ({
    id,
    element,
    power: POWER[tier]!,
    accuracy: ACCURACY[tier]!,
    name: { es, en },
  })),
);

export const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(SKILLS.map((s) => [s.id, s]));

/** The skill of `element` at `tier` (0 = weakest, 3 = strongest). */
export function skillOf(element: Element, tier: 0 | 1 | 2 | 3): string {
  return ROWS[element][tier][0];
}
