/**
 * Passive abilities. Each has an effect key and numbers the combat engine (milestone 7) will
 * apply; names and descriptions are shown in the Dex now.
 */
export interface Passive {
  id: string;
  effect:
    | 'survive_once'
    | 'flee_bonus'
    | 'stat_bonus'
    | 'enemy_debuff'
    | 'regen'
    | 'recoil_power'
    | 'first_hit_tax'
    | 'debuff_immunity'
    | 'random_buff'
    | 'speed_ramp'
    | 'never_miss'
    | 'drain'
    | 'double_hit'
    | 'resist_super'
    | 'evasion'
    | 'halve_once'
    | 'execute'
    | 'wait_speed';
  /** Effect strength: a fraction (0.1 = 10 %) or a count, depending on the effect. */
  value: number;
  /** Which stat `stat_bonus` raises or `enemy_debuff` lowers. */
  stat?: 'atk' | 'def' | 'spd' | 'all';
  name: { es: string; en: string };
  text: { es: string; en: string };
}

const P = (
  id: string,
  effect: Passive['effect'],
  value: number,
  es: [string, string],
  en: [string, string],
): Passive => ({
  id,
  effect,
  value,
  name: { es: es[0], en: en[0] },
  text: { es: es[1], en: en[1] },
});

export const PASSIVES: Passive[] = [
  P(
    'gas-fee',
    'first_hit_tax',
    0.05,
    ['Peaje', 'El primer ataque rival le cuesta un 5 % de su vida.'],
    ['Toll', "The foe's first attack costs it 5% of its HP."],
  ),
  P(
    'burn-supply',
    'recoil_power',
    0.2,
    ['Quema de reservas', '+20 % de daño a cambio de perder un 5 % de vida al atacar.'],
    ['Supply Burn', '+20% damage, losing 5% HP per attack.'],
  ),
  P(
    'whale-weight',
    'stat_bonus',
    0.1,
    ['Peso de ballena', '+10 % de defensa.'],
    ['Whale Weight', '+10% defense.'],
  ),
  P(
    'auto-compound',
    'regen',
    0.05,
    ['Interés compuesto', 'Recupera un 5 % de vida cada turno.'],
    ['Auto-compound', 'Heals 5% HP every turn.'],
  ),
  P(
    'fud-aura',
    'enemy_debuff',
    0.1,
    ['Aura de FUD', 'El rival empieza con un 10 % menos de ataque.'],
    ['FUD Aura', 'The foe starts with 10% less attack.'],
  ),
  P(
    'good-morning',
    'regen',
    0.03,
    ['Buenos días', 'Recupera un 3 % de vida cada turno.'],
    ['Good Morning', 'Heals 3% HP every turn.'],
  ),
  P(
    'chain-armor',
    'stat_bonus',
    0.12,
    ['Blindaje encadenado', '+12 % de defensa.'],
    ['Chain Armor', '+12% defense.'],
  ),
  P(
    'cold-storage',
    'debuff_immunity',
    1,
    ['Almacenamiento en frío', 'Ignora el primer efecto negativo.'],
    ['Cold Storage', 'Ignores the first negative effect.'],
  ),
  P(
    'lucky-drop',
    'random_buff',
    0.1,
    ['Regalo inesperado', 'Empieza con +10 % en una estadística al azar.'],
    ['Lucky Drop', 'Starts with +10% on a random stat.'],
  ),
  P(
    'to-the-moon',
    'speed_ramp',
    0.05,
    ['Hasta la luna', '+5 % de velocidad cada turno.'],
    ['To the Moon', '+5% speed every turn.'],
  ),
  P(
    'paper-hands',
    'flee_bonus',
    0.25,
    ['Manos de papel', 'Más fácil de huir; +25 % de velocidad con poca vida.'],
    ['Paper Hands', 'Flees easily; +25% speed at low HP.'],
  ),
  P(
    'diamond-hands',
    'survive_once',
    1,
    ['Manos de diamante', 'Aguanta un golpe mortal con 1 de vida, una vez por combate.'],
    ['Diamond Hands', 'Survives a knockout blow with 1 HP, once per battle.'],
  ),
  P(
    'bear-hug',
    'enemy_debuff',
    0.12,
    ['Abrazo bajista', 'El rival empieza con un 12 % menos de velocidad.'],
    ['Bear Hug', 'The foe starts with 12% less speed.'],
  ),
  P(
    'bull-charge',
    'stat_bonus',
    0.12,
    ['Embestida alcista', '+12 % de ataque.'],
    ['Bull Charge', '+12% attack.'],
  ),
  P(
    'margin-call',
    'execute',
    0.3,
    ['Llamada de margen', '+30 % de daño contra rivales con menos de un tercio de vida.'],
    ['Margin Call', '+30% damage against foes below a third of their HP.'],
  ),
  P(
    'queue-patience',
    'wait_speed',
    0.1,
    ['Paciencia en la cola', '+10 % de velocidad cada vez que espera un turno.'],
    ['Queue Patience', '+10% speed each time it waits a turn.'],
  ),
  P(
    'copium',
    'regen',
    0.04,
    ['Copium', 'Se convence de que todo va bien: recupera un 4 % de vida cada turno.'],
    ['Copium', 'Convinces itself all is fine: heals 4% HP every turn.'],
  ),
  P(
    'bridge-toll',
    'drain',
    0.08,
    ['Peaje del puente', 'Roba un 8 % del daño que causa.'],
    ['Bridge Toll', 'Steals 8% of the damage it deals.'],
  ),
  P(
    'phisher',
    'enemy_debuff',
    0.15,
    ['Suplantador', 'El rival empieza con un 15 % menos de defensa.'],
    ['Phisher', 'The foe starts with 15% less defense.'],
  ),
  P(
    'genesis',
    'stat_bonus',
    0.08,
    ['Bloque génesis', '+8 % en todas las estadísticas.'],
    ['Genesis Block', '+8% to every stat.'],
  ),
  P(
    'halving',
    'halve_once',
    1,
    ['Halving', 'El primer golpe que recibe hace la mitad de daño.'],
    ['Halving', 'The first hit it takes does half damage.'],
  ),
  P(
    'forked',
    'double_hit',
    0.15,
    ['Bifurcación', '15 % de probabilidad de atacar dos veces.'],
    ['Forked', '15% chance to strike twice.'],
  ),
  P(
    'byzantine',
    'resist_super',
    0.25,
    ['Tolerancia bizantina', 'Recibe un 25 % menos de daño de ataques muy eficaces.'],
    ['Byzantine Tolerance', 'Takes 25% less damage from super-effective attacks.'],
  ),
  P(
    'infinite-chain',
    'regen',
    0.06,
    ['Cadena infinita', 'Recupera un 6 % de vida cada turno.'],
    ['Infinite Chain', 'Heals 6% HP every turn.'],
  ),
  P(
    'zero-knowledge',
    'evasion',
    0.15,
    ['Conocimiento cero', '15 % de probabilidad de esquivar.'],
    ['Zero Knowledge', '15% chance to dodge.'],
  ),
  P(
    'verified',
    'never_miss',
    1,
    ['Verificado', 'Sus ataques nunca fallan.'],
    ['Verified', 'Its attacks never miss.'],
  ),
];

/** The stat each stat-changing passive affects (matches its description). */
const STAT_OF: Record<string, NonNullable<Passive['stat']>> = {
  'whale-weight': 'def',
  'chain-armor': 'def',
  'bull-charge': 'atk',
  genesis: 'all',
  'fud-aura': 'atk',
  'bear-hug': 'spd',
  phisher: 'def',
};
for (const p of PASSIVES) {
  const stat = STAT_OF[p.id];
  if (stat) p.stat = stat;
}

export const PASSIVES_BY_ID: ReadonlyMap<string, Passive> = new Map(PASSIVES.map((p) => [p.id, p]));
