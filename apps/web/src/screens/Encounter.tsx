import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ApiError,
  type Api,
  type BattleView,
  type CaptureResult,
  type Encounter as Enc,
  type NearbyCreature,
  type OwnedCreature,
} from '../api';
import { thumbUrl, useContent } from '../content';
import { Battle, Sprite } from './Battle';
import { ThrowGame, type ThrowOutcome } from './ThrowGame';
import { Habitat, isNight } from '../scenes/Habitat';
import '../scenes/habitat.css';
import './throwgame.css';

const VAULTS = ['vault-basic', 'vault-reinforced', 'vault-cold'] as const;

type Lang = 'es' | 'en';

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** New random key for one throw; reused on retries of that same throw. */
function newKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Facing a wild creature, in a scene of the kind of place it was found: pick a vault, tune it in
 * the mini-game and throw it. The server decides the outcome; the client only sends the vault and
 * the mini-game's score (0–1).
 */
/** Reasons for no tip worth telling the player (the rest: minors, tips off). */
const TIP_HINTS = new Set([
  'no_wallet',
  'too_soon',
  'too_close',
  'daily_limit',
  'pool_empty',
  'under_review',
  'not_verified',
]);

export function Encounter({
  api,
  spawn,
  onClose,
}: {
  api: Api;
  spawn: NearbyCreature;
  /** `gone` is true when the creature was caught or ran away (drop it from the map). */
  onClose: (gone: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const { dex } = useContent(api);
  const [enc, setEnc] = useState<Enc | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  /** Choosing who battles (list of the player's creatures), then the battle itself. */
  const [picking, setPicking] = useState<OwnedCreature[] | null>(null);
  const [battle, setBattle] = useState<BattleView | null>(null);
  const pendingKey = useRef<string | null>(null);
  const still = useMemo(() => reducedMotion(), []);
  const night = useMemo(() => isNight(), []);
  /** The server's answer, held until the vault has finished shaking. */
  const [outcome, setOutcome] = useState<ThrowOutcome | null>(null);
  const answer = useRef<{ r: CaptureResult; item: string } | null>(null);
  /** Bumped for a fresh mini-game (after an escape or an error). */
  const [round, setRound] = useState(0);

  const def = dex?.creatures.find((c) => c.id === spawn.creatureId);
  const name = def?.name ?? spawn.creatureId;
  const items = useMemo(() => new Map(dex?.items.map((i) => [i.id, i])), [dex]);

  const errorText = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : 'other';
    return t(`errors.${code}`, { defaultValue: t('errors.other') });
  };

  useEffect(() => {
    let live = true;
    api
      .encounter(spawn.id)
      .then((e) => {
        if (!live) return;
        setEnc(e);
        const first = VAULTS.find((v) => e.inventory.some((i) => i.id === v && i.qty > 0));
        setItem(first ?? null);
      })
      .catch((err) => live && setError(errorText(err)));
    return () => {
      live = false;
    };
    // errorText only depends on the language, which cannot change mid-encounter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, spawn.id]);

  const qty = (id: string) => enc?.inventory.find((i) => i.id === id)?.qty ?? 0;

  async function throwVault(skill: number) {
    if (!enc || !item) return;
    pendingKey.current ??= newKey();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.capture(enc.id, item, skill, pendingKey.current);
      pendingKey.current = null;
      answer.current = { r, item };
      // the mini-game plays the shakes, then calls finishThrow
      setOutcome(r.result);
    } catch (err) {
      // Only a lost connection keeps the key: the throw may have happened, and retrying with
      // the same key returns that result instead of spending a second vault.
      if (!(err instanceof ApiError && err.code === 'network')) pendingKey.current = null;
      setError(errorText(err));
      setRound((n) => n + 1);
      setBusy(false);
    }
  }

  function finishThrow() {
    const a = answer.current;
    answer.current = null;
    setBusy(false);
    if (!a || !enc) return;
    const { r } = a;
    setResult(r);
    setEnc({
      ...enc,
      attempts: r.attempts,
      status: r.result === 'caught' ? 'caught' : r.result === 'fled' ? 'fled' : 'open',
      inventory: enc.inventory.map((i) => (i.id === a.item ? { ...i, qty: r.itemsLeft } : i)),
    });
    if (r.itemsLeft === 0) {
      setItem(VAULTS.find((v) => v !== a.item && qty(v) > 0) ?? null);
    }
    if (r.result === 'escaped') {
      setOutcome(null);
      setRound((n) => n + 1);
    }
  }

  const over = enc?.status === 'caught' || enc?.status === 'fled';

  async function choose() {
    setError(null);
    try {
      setPicking((await api.myCreatures()).creatures);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function fightWith(creature: string) {
    if (!enc) return;
    setBusy(true);
    setError(null);
    try {
      setBattle(await api.startBattle(enc.id, creature));
      setPicking(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (battle && dex) {
    return (
      <Battle
        api={api}
        dex={dex}
        start={battle}
        onEnd={(final) => {
          setBattle(null);
          setResult(null);
          // the wild creature keeps the HP the battle left it with
          setEnc((e) =>
            e
              ? {
                  ...e,
                  foeHp: final.foe.hp,
                  foeMaxHp: final.foe.maxHp,
                  worn: e.worn || final.result === 'win',
                }
              : e,
          );
          // patches used in battle came out of the same inventory
          setEnc((e) =>
            e
              ? {
                  ...e,
                  inventory: e.inventory.map((i) =>
                    i.id in final.items ? { ...i, qty: final.items[i.id]! } : i,
                  ),
                }
              : e,
          );
        }}
      />
    );
  }
  const noVaults = enc !== null && VAULTS.every((v) => qty(v) === 0);

  return (
    <section className="card stack encounter" aria-labelledby="enc-title">
      <h2 id="enc-title">{t('encounterTitle', { name })}</h2>
      <p className="muted">
        {t('levelShort', { level: spawn.level })}
        {def ? ` · ${t(`rarity.${def.rarity}`)}` : ''}
        {enc?.biome ? ` · ${t(`place.${enc.biome}`)}` : ''}
      </p>
      <div className="scene encounter-scene">
        <Habitat kind={enc?.biome ?? 'urban'} night={night} />
        <div
          className="spot"
          role="img"
          aria-label={t('artLabel', { name })}
          data-creature={spawn.creatureId}
        >
          <Sprite id={spawn.creatureId} fx={null} fainted={false} />
          <span className="platform" aria-hidden="true" />
        </div>
        {enc && def && (outcome !== null || (!over && !noVaults && item)) && (
          <ThrowGame
            key={round}
            rarity={def.rarity}
            color={dex?.elements.find((e) => e.id === def.element)?.color ?? '#43f289'}
            vault={item ?? 'vault-basic'}
            disabled={busy && outcome === null}
            outcome={outcome}
            still={still}
            onThrow={(skill) => void throwVault(skill)}
            onFinished={finishThrow}
          />
        )}
      </div>
      {def && <p>{def.lore[lang]}</p>}
      {enc && !over && enc.foeHp !== null && enc.foeMaxHp !== null && (
        <p className="notice">
          {enc.foeHp === 0
            ? t('foeWorn', { name })
            : enc.foeHp < enc.foeMaxHp
              ? t('foeHurt', { name, hp: enc.foeHp, max: enc.foeMaxHp })
              : null}
        </p>
      )}

      {result && (
        <div role="status" className={`result result-${result.result}`}>
          <p>
            <strong>
              {t(
                result.result === 'caught'
                  ? 'resultCaught'
                  : result.result === 'fled'
                    ? 'resultFled'
                    : 'resultEscaped',
                { name },
              )}
            </strong>
          </p>
          <p className="muted">{t('chanceLine', { pct: Math.round(result.chance * 100) })}</p>
          <p>{t('rewardLine', { xp: result.reward.xp, gold: result.reward.gold })}</p>
          {result.reward.leveledUp && <p>{t('levelUp', { level: result.reward.level })}</p>}
          {result.tip && (
            <p className="tip-won">{t('tips.won', { amount: result.tip.amountNear })}</p>
          )}
          {!result.tip && result.noTip && TIP_HINTS.has(result.noTip) && (
            <p className="muted small">{t(`tips.no.${result.noTip}`)}</p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}

      {enc && !over && (
        <>
          <fieldset className="vaults">
            <legend>{t('chooseVault')}</legend>
            {VAULTS.map((v) => (
              <label key={v} className={qty(v) === 0 ? 'vault empty' : 'vault'}>
                <input
                  type="radio"
                  name="vault"
                  value={v}
                  checked={item === v}
                  disabled={qty(v) === 0 || busy}
                  onChange={() => setItem(v)}
                />
                {t('vaultCount', { name: items.get(v)?.name[lang] ?? v, count: qty(v) })}
              </label>
            ))}
          </fieldset>
          {noVaults ? <p>{t('noVaults')}</p> : <p className="muted small">{t('tg.how')}</p>}
        </>
      )}
      {enc && !over && !enc.worn && enc.foeHp !== 0 && !picking && (
        <button type="button" className="secondary" disabled={busy} onClick={choose}>
          {t('fight')}
        </button>
      )}
      {picking && (
        <fieldset className="vaults">
          <legend>{t('chooseFighter')}</legend>
          {picking.filter((c) => c.hp > 0).length === 0 && <p>{t('noFighters')}</p>}
          {picking.map((c) => {
            const d = dex?.creatures.find((x) => x.id === c.creatureId);
            return (
              <button
                key={c.id}
                type="button"
                className="pick"
                disabled={busy || c.hp <= 0}
                onClick={() => fightWith(c.id)}
              >
                <img src={thumbUrl(c.creatureId)} alt="" width={40} height={58} />
                <span>
                  {d?.name ?? c.creatureId} · {t('levelShort', { level: c.level })}
                </span>
                <span className="muted small">
                  {c.hp > 0 ? t('hpLine', { hp: c.hp, max: c.maxHp }) : t('resting')}
                </span>
              </button>
            );
          })}
          <button type="button" className="link" onClick={() => setPicking(null)}>
            {t('cancel')}
          </button>
        </fieldset>
      )}
      <button type="button" className={over ? '' : 'secondary'} onClick={() => onClose(over)}>
        {over ? t('backToMap') : t('run')}
      </button>
    </section>
  );
}
