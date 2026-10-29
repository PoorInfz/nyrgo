import { ELEMENTS, type Element, type Rarity } from '../domain.js';
import { STRONG_AGAINST, weakAgainst } from './elements.js';
import { skillOf } from './skills.js';

/**
 * The 50 original creatures approved on 2026-10-29 ("nyrgo — Universo de criaturas").
 * Only design data is written by hand; stats, skills, capture difficulty and evolution costs
 * are derived by the rules below so balance changes happen in one place.
 */

export type Archetype = 'balanced' | 'tank' | 'striker' | 'swift';
export type Biome = 'urban' | 'park' | 'historic' | 'culture';
export type Material = 'hash-shard' | 'moon-dust' | 'vault-frost' | 'yield-seed';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface Evolution {
  to: string;
  /** Level the creature must reach; null when the condition is time held instead. */
  level: number | null;
  /** Days kept in the collection without being traded (the HODL evolution). */
  holdDays: number | null;
  gold: number;
  materials: Partial<Record<Material, number>>;
}

export interface CreatureDef {
  id: string;
  dex: number;
  name: string;
  element: Element;
  rarity: Rarity;
  archetype: Archetype;
  stage: 1 | 2 | 3;
  stats: Stats;
  skills: string[];
  passive: string;
  /** 1–100; feeds the capture formula's base chance alongside rarity. */
  captureDifficulty: number;
  biomes: Biome[];
  /** False for legendary and mythic creatures: they only appear in events. */
  wild: boolean;
  starter: boolean;
  evolution: Evolution | null;
  inspiration: string;
  lore: { es: string; en: string };
}

interface Spec {
  id: string;
  name: string;
  element: Element;
  rarity: Rarity;
  archetype: Archetype;
  stage: 1 | 2 | 3;
  passive: string;
  evolvesTo?: string;
  level?: number;
  holdDays?: number;
  starter?: boolean;
  inspiration: string;
  es: string;
  en: string;
}

/** Base stat total by rarity; every evolution step lands on a higher total. */
export const STAT_TOTAL: Record<Rarity, number> = {
  common: 300,
  uncommon: 400,
  rare: 490,
  epic: 530,
  legendary: 580,
  mythic: 600,
};

const WEIGHTS: Record<Archetype, [number, number, number, number]> = {
  balanced: [0.27, 0.25, 0.24, 0.24],
  tank: [0.34, 0.2, 0.32, 0.14],
  striker: [0.22, 0.34, 0.18, 0.26],
  swift: [0.22, 0.27, 0.17, 0.34],
};

export const CAPTURE_DIFFICULTY: Record<Rarity, number> = {
  common: 15,
  uncommon: 30,
  rare: 50,
  epic: 70,
  legendary: 90,
  mythic: 98,
};

const BIOMES_BY_ELEMENT: Record<Element, Biome[]> = {
  water: ['park', 'historic'],
  fire: ['urban'],
  nature: ['park'],
  earth: ['historic'],
  electric: ['urban'],
  wind: ['park', 'urban'],
  ice: ['culture'],
  cosmic: ['culture', 'historic'],
  light: ['historic', 'culture'],
  shadow: ['urban'],
};

const MATERIAL_BY_ELEMENT: Record<Element, Material> = {
  electric: 'hash-shard',
  earth: 'hash-shard',
  fire: 'hash-shard',
  cosmic: 'moon-dust',
  wind: 'moon-dust',
  light: 'moon-dust',
  ice: 'vault-frost',
  water: 'vault-frost',
  nature: 'yield-seed',
  shadow: 'yield-seed',
};

export function deriveStats(rarity: Rarity, archetype: Archetype): Stats {
  const total = STAT_TOTAL[rarity];
  const [hp, atk, def, spd] = WEIGHTS[archetype].map((w) => Math.round(total * w)) as [
    number,
    number,
    number,
    number,
  ];
  return { hp, atk, def, spd };
}

/** An element that hits this element's first weakness hard: the "answer" skill rares carry. */
export function coverageElement(e: Element): Element {
  const threat = weakAgainst(e)[0]!;
  return ELEMENTS.find((x) => x !== e && STRONG_AGAINST[x].includes(threat))!;
}

export function deriveSkills(element: Element, rarity: Rarity): string[] {
  switch (rarity) {
    case 'common':
      return [skillOf(element, 0), skillOf(element, 1)];
    case 'uncommon':
      return [skillOf(element, 0), skillOf(element, 1), skillOf(element, 2)];
    case 'rare':
    case 'epic':
      return [
        skillOf(element, 1),
        skillOf(element, 2),
        skillOf(element, 3),
        skillOf(coverageElement(element), 1),
      ];
    default:
      return [
        skillOf(element, 1),
        skillOf(element, 2),
        skillOf(element, 3),
        skillOf(coverageElement(element), 2),
      ];
  }
}

const SPECS: Spec[] = [
  // Gas line
  {
    id: 'gwisp',
    name: 'Gwisp',
    element: 'electric',
    rarity: 'common',
    archetype: 'swift',
    stage: 1,
    passive: 'gas-fee',
    evolvesTo: 'gasguzzle',
    level: 16,
    starter: true,
    inspiration: 'Comisiones de gas',
    es: 'Chispita de gas que cobra un peaje por cada paso que das.',
    en: 'A little gas spark that charges a toll for every step you take.',
  },
  {
    id: 'gasguzzle',
    name: 'Gasguzzle',
    element: 'electric',
    rarity: 'uncommon',
    archetype: 'swift',
    stage: 2,
    passive: 'gas-fee',
    evolvesTo: 'gaswarlord',
    level: 36,
    inspiration: 'Guerra de gas',
    es: 'Se bebe la red entera cuando hay prisa.',
    en: 'Drinks the whole network dry whenever there is a rush.',
  },
  {
    id: 'gaswarlord',
    name: 'Gaswarlord',
    element: 'electric',
    rarity: 'rare',
    archetype: 'swift',
    stage: 3,
    passive: 'gas-fee',
    inspiration: 'Gas wars',
    es: 'Señor de las tarifas; sube el precio al ver una cola.',
    en: 'Lord of fees; raises the price the moment it sees a queue.',
  },
  // Burn line
  {
    id: 'burnlet',
    name: 'Burnlet',
    element: 'fire',
    rarity: 'common',
    archetype: 'striker',
    stage: 1,
    passive: 'burn-supply',
    evolvesTo: 'embernomic',
    level: 16,
    inspiration: 'Quema de tokens',
    es: 'Brasa que se come un poco de sí misma para valer más.',
    en: 'An ember that eats a little of itself to be worth more.',
  },
  {
    id: 'embernomic',
    name: 'Embernomic',
    element: 'fire',
    rarity: 'uncommon',
    archetype: 'striker',
    stage: 2,
    passive: 'burn-supply',
    evolvesTo: 'deflagron',
    level: 36,
    inspiration: 'Tokenomics',
    es: 'Economista en llamas con gráficos que solo suben.',
    en: 'A blazing economist whose charts only ever go up.',
  },
  {
    id: 'deflagron',
    name: 'Deflagron',
    element: 'fire',
    rarity: 'rare',
    archetype: 'striker',
    stage: 3,
    passive: 'burn-supply',
    inspiration: 'Deflación + deflagración',
    es: 'Dragón que quema reservas enteras para impresionar.',
    en: 'A dragon that burns entire reserves just to impress.',
  },
  // Holder-size line
  {
    id: 'shrimpie',
    name: 'Shrimpie',
    element: 'water',
    rarity: 'common',
    archetype: 'tank',
    stage: 1,
    passive: 'whale-weight',
    evolvesTo: 'crabwalk',
    level: 18,
    inspiration: 'Holder gamba',
    es: 'Gamba diminuta con cuatro monedas y mucha fe.',
    en: 'A tiny shrimp with four coins and a lot of faith.',
  },
  {
    id: 'crabwalk',
    name: 'Crabwalk',
    element: 'water',
    rarity: 'uncommon',
    archetype: 'tank',
    stage: 2,
    passive: 'whale-weight',
    evolvesTo: 'leviawhale',
    level: 40,
    inspiration: 'Mercado cangrejo',
    es: 'Solo camina de lado, como el precio en verano.',
    en: 'Only ever walks sideways, like prices in summer.',
  },
  {
    id: 'leviawhale',
    name: 'Leviawhale',
    element: 'water',
    rarity: 'epic',
    archetype: 'tank',
    stage: 3,
    passive: 'whale-weight',
    inspiration: 'Ballena',
    es: 'Cuando se mueve, todo el océano tiembla.',
    en: 'When it moves, the whole ocean shakes.',
  },
  // Farming line
  {
    id: 'yieldling',
    name: 'Yieldling',
    element: 'nature',
    rarity: 'common',
    archetype: 'balanced',
    stage: 1,
    passive: 'auto-compound',
    evolvesTo: 'stakestalk',
    level: 16,
    inspiration: 'Yield farming',
    es: 'Brote que da frutos si lo dejas quieto.',
    en: 'A sprout that bears fruit if you leave it alone.',
  },
  {
    id: 'stakestalk',
    name: 'Stakestalk',
    element: 'nature',
    rarity: 'uncommon',
    archetype: 'balanced',
    stage: 2,
    passive: 'auto-compound',
    evolvesTo: 'yieldrasil',
    level: 36,
    inspiration: 'Staking',
    es: 'Tallo bloqueado que crece por intereses.',
    en: 'A locked stalk that grows on interest.',
  },
  {
    id: 'yieldrasil',
    name: 'Yieldrasil',
    element: 'nature',
    rarity: 'rare',
    archetype: 'tank',
    stage: 3,
    passive: 'auto-compound',
    inspiration: 'Yggdrasil',
    es: 'Árbol del mundo cuyas raíces cobran un APY a cada reino.',
    en: 'A world tree whose roots charge every realm an APY.',
  },
  // Rug line
  {
    id: 'fuddle',
    name: 'Fuddle',
    element: 'shadow',
    rarity: 'common',
    archetype: 'swift',
    stage: 1,
    passive: 'fud-aura',
    evolvesTo: 'ruglet',
    level: 18,
    inspiration: 'FUD',
    es: 'Gremlin que susurra «esto se hunde» en tu oído.',
    en: 'A gremlin that whispers "it\'s all going to zero" in your ear.',
  },
  {
    id: 'ruglet',
    name: 'Ruglet',
    element: 'shadow',
    rarity: 'uncommon',
    archetype: 'balanced',
    stage: 2,
    passive: 'fud-aura',
    evolvesTo: 'rugpullor',
    level: 38,
    inspiration: 'Rug pull',
    es: 'Alfombrita simpática; no te pongas encima.',
    en: 'A friendly little rug. Do not stand on it.',
  },
  {
    id: 'rugpullor',
    name: 'Rugpullor',
    element: 'shadow',
    rarity: 'epic',
    archetype: 'striker',
    stage: 3,
    passive: 'fud-aura',
    inspiration: 'Rug pull',
    es: 'Alfombra gigante que desaparece con todo lo que lleva encima.',
    en: 'A giant rug that vanishes with everything standing on it.',
  },
  // GM line
  {
    id: 'gmlet',
    name: 'Gmlet',
    element: 'light',
    rarity: 'common',
    archetype: 'balanced',
    stage: 1,
    passive: 'good-morning',
    evolvesTo: 'wagmight',
    level: 16,
    inspiration: '«GM»',
    es: 'Pollito solar que saluda a todo el mundo al amanecer.',
    en: 'A sunny chick that greets everyone at dawn.',
  },
  {
    id: 'wagmight',
    name: 'Wagmight',
    element: 'light',
    rarity: 'uncommon',
    archetype: 'balanced',
    stage: 2,
    passive: 'good-morning',
    evolvesTo: 'oraclion',
    level: 36,
    inspiration: 'WAGMI',
    es: 'Guerrero optimista que anima a su equipo.',
    en: 'An optimistic warrior who keeps the whole team going.',
  },
  {
    id: 'oraclion',
    name: 'Oraclion',
    element: 'light',
    rarity: 'rare',
    archetype: 'striker',
    stage: 3,
    passive: 'verified',
    inspiration: 'Oráculos',
    es: 'León que solo ruge con datos verificados.',
    en: 'A lion that only roars with verified data.',
  },
  // Mining line
  {
    id: 'pebblock',
    name: 'Pebblock',
    element: 'earth',
    rarity: 'common',
    archetype: 'tank',
    stage: 1,
    passive: 'chain-armor',
    evolvesTo: 'blockgolem',
    level: 16,
    inspiration: 'Bloque',
    es: 'Piedra cuadrada que se apila con otras como ella.',
    en: 'A square pebble that stacks itself with others like it.',
  },
  {
    id: 'blockgolem',
    name: 'Blockgolem',
    element: 'earth',
    rarity: 'uncommon',
    archetype: 'tank',
    stage: 2,
    passive: 'chain-armor',
    evolvesTo: 'petagolem',
    level: 36,
    inspiration: 'Cadena de bloques',
    es: 'Gólem hecho de bloques encadenados, cada uno con su sello.',
    en: 'A golem of chained blocks, each one sealed by the last.',
  },
  {
    id: 'petagolem',
    name: 'Petagolem',
    element: 'earth',
    rarity: 'rare',
    archetype: 'tank',
    stage: 3,
    passive: 'chain-armor',
    inspiration: 'Petahash',
    es: 'Montaña andante que zumba como una sala de minería.',
    en: 'A walking mountain that hums like a mining farm.',
  },
  // Cold line
  {
    id: 'frostkey',
    name: 'Frostkey',
    element: 'ice',
    rarity: 'common',
    archetype: 'balanced',
    stage: 1,
    passive: 'cold-storage',
    evolvesTo: 'coldvault',
    level: 16,
    starter: true,
    inspiration: 'Clave privada',
    es: 'Llavecita de hielo que nunca sale de casa.',
    en: 'A little ice key that never leaves home.',
  },
  {
    id: 'coldvault',
    name: 'Coldvault',
    element: 'ice',
    rarity: 'uncommon',
    archetype: 'tank',
    stage: 2,
    passive: 'cold-storage',
    evolvesTo: 'hodlberg',
    level: 36,
    inspiration: 'Cartera fría',
    es: 'Cofre helado que no abre a desconocidos.',
    en: 'A frozen chest that never opens for strangers.',
  },
  {
    id: 'hodlberg',
    name: 'Hodlberg',
    element: 'ice',
    rarity: 'rare',
    archetype: 'tank',
    stage: 3,
    passive: 'cold-storage',
    inspiration: 'HODL + iceberg',
    es: 'Iceberg inamovible; solo ves la punta de lo que guarda.',
    en: 'An unmovable iceberg; you only see the tip of what it holds.',
  },
  // Airdrop line
  {
    id: 'dropling',
    name: 'Dropling',
    element: 'wind',
    rarity: 'common',
    archetype: 'swift',
    stage: 1,
    passive: 'lucky-drop',
    evolvesTo: 'claimglider',
    level: 16,
    starter: true,
    inspiration: 'Airdrop',
    es: 'Semilla con paracaídas que aterriza donde menos lo esperas.',
    en: 'A seed with a parachute that lands where you least expect it.',
  },
  {
    id: 'claimglider',
    name: 'Claimglider',
    element: 'wind',
    rarity: 'uncommon',
    archetype: 'swift',
    stage: 2,
    passive: 'lucky-drop',
    evolvesTo: 'airdragon',
    level: 36,
    inspiration: 'Reclamar',
    es: 'Planeador que siempre llega el primero al reparto.',
    en: 'A glider that always reaches the giveaway first.',
  },
  {
    id: 'airdragon',
    name: 'Airdragon',
    element: 'wind',
    rarity: 'rare',
    archetype: 'swift',
    stage: 3,
    passive: 'lucky-drop',
    inspiration: 'Lluvia de airdrops',
    es: 'Dragón de nubes que reparte regalos al planear.',
    en: 'A cloud dragon that scatters gifts as it glides.',
  },
  // Moon line
  {
    id: 'wenling',
    name: 'Wenling',
    element: 'cosmic',
    rarity: 'common',
    archetype: 'swift',
    stage: 1,
    passive: 'to-the-moon',
    evolvesTo: 'moonshot',
    level: 18,
    inspiration: '«Wen moon?»',
    es: 'Crío que pregunta cuándo llegamos cada cinco minutos.',
    en: 'A kid who asks "are we there yet?" every five minutes.',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    element: 'cosmic',
    rarity: 'uncommon',
    archetype: 'striker',
    stage: 2,
    passive: 'to-the-moon',
    evolvesTo: 'selenarch',
    level: 38,
    inspiration: 'Moonshot',
    es: 'Cohete impaciente; la mitad de las veces no despega.',
    en: 'An impatient rocket; half the time it never takes off.',
  },
  {
    id: 'selenarch',
    name: 'Selenarch',
    element: 'cosmic',
    rarity: 'rare',
    archetype: 'balanced',
    stage: 3,
    passive: 'to-the-moon',
    inspiration: 'To the moon',
    es: 'Monarca lunar que mira la Tierra desde arriba.',
    en: 'A lunar monarch looking down on the Earth.',
  },
  // Hands line (HODL evolution)
  {
    id: 'paperpaw',
    name: 'Paperpaw',
    element: 'wind',
    rarity: 'common',
    archetype: 'swift',
    stage: 1,
    passive: 'paper-hands',
    evolvesTo: 'diamondpaw',
    holdDays: 30,
    inspiration: 'Paper hands',
    es: 'Gatito de papel que huye al primer susto.',
    en: 'A paper kitten that bolts at the first scare.',
  },
  {
    id: 'diamondpaw',
    name: 'Diamondpaw',
    element: 'earth',
    rarity: 'epic',
    archetype: 'tank',
    stage: 2,
    passive: 'diamond-hands',
    inspiration: 'Diamond hands',
    es: 'El mismo gato, ahora de diamante; ya no suelta nada.',
    en: 'The same cat, now made of diamond. It never lets go.',
  },
  // Bear and bull
  {
    id: 'bearkit',
    name: 'Bearkit',
    element: 'ice',
    rarity: 'common',
    archetype: 'tank',
    stage: 1,
    passive: 'bear-hug',
    evolvesTo: 'grizzlydump',
    level: 30,
    inspiration: 'Mercado bajista',
    es: 'Osezno que hiberna cuando todo cae.',
    en: 'A bear cub that hibernates whenever everything falls.',
  },
  {
    id: 'grizzlydump',
    name: 'Grizzlydump',
    element: 'ice',
    rarity: 'epic',
    archetype: 'tank',
    stage: 2,
    passive: 'bear-hug',
    inspiration: 'Crypto winter',
    es: 'Oso del invierno cripto; tumba los gráficos de un zarpazo.',
    en: 'The bear of crypto winter; one swipe and the charts collapse.',
  },
  {
    id: 'bullcalf',
    name: 'Bullcalf',
    element: 'fire',
    rarity: 'common',
    archetype: 'striker',
    stage: 1,
    passive: 'bull-charge',
    evolvesTo: 'bullrush',
    level: 30,
    inspiration: 'Mercado alcista',
    es: 'Ternero que embiste cualquier línea roja.',
    en: 'A calf that charges at any red line.',
  },
  {
    id: 'bullrush',
    name: 'Bullrush',
    element: 'fire',
    rarity: 'epic',
    archetype: 'striker',
    stage: 2,
    passive: 'bull-charge',
    inspiration: 'Bull run',
    es: 'Toro desbocado; rival eterno de Grizzlydump.',
    en: "A runaway bull, Grizzlydump's eternal rival.",
  },
  // Leverage line
  {
    id: 'leverat',
    name: 'Leverat',
    element: 'electric',
    rarity: 'common',
    archetype: 'striker',
    stage: 1,
    passive: 'margin-call',
    evolvesTo: 'liquidatron',
    level: 28,
    inspiration: 'Apalancamiento',
    es: 'Rata que apuesta diez veces lo que tiene.',
    en: 'A rat that bets ten times what it owns.',
  },
  {
    id: 'liquidatron',
    name: 'Liquidatron',
    element: 'electric',
    rarity: 'rare',
    archetype: 'striker',
    stage: 2,
    passive: 'margin-call',
    inspiration: 'Liquidación',
    es: 'Robot que llega cuando el margen se acaba.',
    en: 'A robot that arrives when the margin runs out.',
  },
  // Mempool line
  {
    id: 'mempup',
    name: 'Mempup',
    element: 'water',
    rarity: 'common',
    archetype: 'balanced',
    stage: 1,
    passive: 'queue-patience',
    evolvesTo: 'blockhound',
    level: 20,
    inspiration: 'Mempool',
    es: 'Cachorro que espera en la cola sin quejarse.',
    en: 'A puppy that waits in the queue without complaining.',
  },
  {
    id: 'blockhound',
    name: 'Blockhound',
    element: 'water',
    rarity: 'uncommon',
    archetype: 'swift',
    stage: 2,
    passive: 'queue-patience',
    inspiration: 'Confirmación de bloque',
    es: 'Sabueso que no suelta una transacción hasta confirmarla.',
    en: 'A hound that never lets go of a transaction until it is confirmed.',
  },
  // Copium line
  {
    id: 'copiumoth',
    name: 'Copiumoth',
    element: 'shadow',
    rarity: 'common',
    archetype: 'balanced',
    stage: 1,
    passive: 'copium',
    evolvesTo: 'hopiumoth',
    level: 20,
    inspiration: 'Copium',
    es: 'Polilla que respira excusas para no aceptar pérdidas.',
    en: 'A moth that breathes excuses so it never has to admit a loss.',
  },
  {
    id: 'hopiumoth',
    name: 'Hopiumoth',
    element: 'light',
    rarity: 'uncommon',
    archetype: 'swift',
    stage: 2,
    passive: 'good-morning',
    inspiration: 'Hopium',
    es: 'La misma polilla, ahora hacia la luz.',
    en: 'The same moth, now flying towards the light.',
  },
  // Standalones
  {
    id: 'bridgetroll',
    name: 'Bridgetroll',
    element: 'nature',
    rarity: 'rare',
    archetype: 'tank',
    stage: 1,
    passive: 'bridge-toll',
    inspiration: 'Hackeos de puentes',
    es: 'Trol musgoso bajo los puentes entre cadenas; cobra a quien cruza.',
    en: 'A mossy troll under the bridges between chains; everyone who crosses pays.',
  },
  {
    id: 'seedsnatcher',
    name: 'Seedsnatcher',
    element: 'shadow',
    rarity: 'epic',
    archetype: 'swift',
    stage: 1,
    passive: 'phisher',
    inspiration: 'Robo de frase semilla',
    es: 'Sombra que pide tus 24 palabras «para verificar». Nunca se las des.',
    en: 'A shadow that asks for your 24 words "to verify". Never give them.',
  },
  {
    id: 'genesaur',
    name: 'Genesaur',
    element: 'earth',
    rarity: 'legendary',
    archetype: 'tank',
    stage: 1,
    passive: 'genesis',
    inspiration: 'Bloque génesis',
    es: 'Fósil del primer bloque; todos los demás descienden de él.',
    en: 'A fossil of the very first block; every other one descends from it.',
  },
  {
    id: 'halvingon',
    name: 'Halvingon',
    element: 'cosmic',
    rarity: 'legendary',
    archetype: 'balanced',
    stage: 1,
    passive: 'halving',
    inspiration: 'Halving',
    es: 'Se parte en dos cada cuatro años y sigue entero.',
    en: 'Splits in two every four years and stays whole.',
  },
  {
    id: 'forkdra',
    name: 'Forkdra',
    element: 'water',
    rarity: 'legendary',
    archetype: 'striker',
    stage: 1,
    passive: 'forked',
    inspiration: 'Hard fork',
    es: 'Hidra: cada desacuerdo le hace crecer otra cabeza.',
    en: 'A hydra: every disagreement grows it another head.',
  },
  {
    id: 'byzantor',
    name: 'Byzantor',
    element: 'wind',
    rarity: 'legendary',
    archetype: 'balanced',
    stage: 1,
    passive: 'byzantine',
    inspiration: 'Generales bizantinos',
    es: 'General que alcanza consenso aunque un tercio mienta.',
    en: 'A general who reaches consensus even when a third of the army lies.',
  },
  {
    id: 'ouroborchain',
    name: 'Ouroborchain',
    element: 'cosmic',
    rarity: 'mythic',
    archetype: 'tank',
    stage: 1,
    passive: 'infinite-chain',
    inspiration: 'Ouroboros + cadena',
    es: 'Serpiente-cadena que se muerde la cola desde el bloque génesis.',
    en: 'A serpent-chain biting its own tail since the genesis block.',
  },
  {
    id: 'zeroknowl',
    name: 'Zeroknowl',
    element: 'shadow',
    rarity: 'mythic',
    archetype: 'swift',
    stage: 1,
    passive: 'zero-knowledge',
    inspiration: 'Pruebas de conocimiento cero',
    es: 'Búho invisible: demuestra que está ahí sin enseñar nada.',
    en: 'An invisible owl: proves it is there without showing anything.',
  },
];

function build(spec: Spec, dex: number, all: Map<string, Spec>): CreatureDef {
  let evolution: Evolution | null = null;
  if (spec.evolvesTo) {
    const target = all.get(spec.evolvesTo);
    if (!target) throw new Error(`${spec.id} evolves into unknown ${spec.evolvesTo}`);
    evolution = {
      to: spec.evolvesTo,
      level: spec.level ?? null,
      holdDays: spec.holdDays ?? null,
      gold: 500 * spec.stage,
      materials: { [MATERIAL_BY_ELEMENT[target.element]]: 3 * spec.stage },
    };
  }
  const event = spec.rarity === 'legendary' || spec.rarity === 'mythic';
  return {
    id: spec.id,
    dex,
    name: spec.name,
    element: spec.element,
    rarity: spec.rarity,
    archetype: spec.archetype,
    stage: spec.stage,
    stats: deriveStats(spec.rarity, spec.archetype),
    skills: deriveSkills(spec.element, spec.rarity),
    passive: spec.passive,
    captureDifficulty: CAPTURE_DIFFICULTY[spec.rarity],
    biomes: event ? [] : BIOMES_BY_ELEMENT[spec.element],
    wild: !event,
    starter: spec.starter ?? false,
    evolution,
    inspiration: spec.inspiration,
    lore: { es: spec.es, en: spec.en },
  };
}

const byId = new Map(SPECS.map((s) => [s.id, s]));

export const CREATURES: CreatureDef[] = SPECS.map((s, i) => build(s, i + 1, byId));
export const CREATURES_BY_ID: ReadonlyMap<string, CreatureDef> = new Map(
  CREATURES.map((c) => [c.id, c]),
);
export const STARTERS: CreatureDef[] = CREATURES.filter((c) => c.starter);

/** Content version: bump whenever any creature, item or recipe changes. */
export const CONTENT_VERSION = 1;
