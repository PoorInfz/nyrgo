import type { TFunction } from 'i18next';

/** "+40 XP · +5 Gold", plus "· +2 NYRGO" when the event also paid tokens. */
export function rewardText(t: TFunction, r: { xp: number; gold: number; token?: number }): string {
  const base = t('rewardLine', { xp: r.xp, gold: r.gold });
  return r.token ? `${base} · +${r.token} NYRGO` : base;
}
