import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COSMETICS,
  COSMETIC_SLOTS,
  type AvatarLook,
  type CosmeticDef,
  type CosmeticSlot,
} from '@nyrgo/shared';
import { ApiError, type Api, type AvatarState } from '../api';
import { Avatar } from '../avatar/Avatar';
import { setLook } from '../avatar/store';

type Lang = 'es' | 'en';

/**
 * The explorer's wardrobe and the cosmetics shop: try any piece on, buy the ones you like with
 * Gold, and save the look the map shows. Cosmetics change nothing in play.
 */
export function Wardrobe({ api, onGold }: { api: Api; onGold?: (gold: number) => void }) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [state, setState] = useState<AvatarState | null>(null);
  const [draft, setDraft] = useState<AvatarLook | null>(null);
  const [slot, setSlot] = useState<CosmeticSlot>('hair');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [failed, setFailed] = useState(false);
  // one key per item until that purchase succeeds, so a retry is never charged twice
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    let live = true;
    api
      .avatar()
      .then((s) => {
        if (!live) return;
        setState(s);
        setDraft(s.avatar);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [api]);

  const owned = useMemo(() => new Set(state?.owned ?? []), [state]);
  const has = (c: CosmeticDef) => c.price === 0 || owned.has(c.id);

  // a side card: if it cannot load, say so quietly (no alert competing with the rest)
  if (failed) return <p className="muted">{t('errors.other')}</p>;
  if (!state || !draft) {
    return (
      <p className="muted" role="status">
        {t('loading')}
      </p>
    );
  }

  const changed = COSMETIC_SLOTS.some((s) => draft[s] !== state.avatar[s]);
  const wearable = COSMETIC_SLOTS.every((s) => {
    const c = COSMETICS.find((x) => x.id === draft[s]);
    return c ? has(c) : false;
  });

  function fail(err: unknown) {
    const code = err instanceof ApiError ? err.code : 'other';
    setNotice({ ok: false, text: t(`errors.${code}`, { defaultValue: t('errors.other') }) });
  }

  async function buy(c: CosmeticDef) {
    if (!window.confirm(t('wardrobe.buyConfirm', { name: c.name[lang], price: c.price }))) return;
    setBusy(true);
    setNotice(null);
    let key = keys.current.get(c.id);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(c.id, key);
    }
    try {
      const s = await api.buyCosmetic(c.id, key);
      keys.current.delete(c.id);
      setState(s);
      onGold?.(s.gold);
      setNotice({ ok: true, text: t('wardrobe.bought', { name: c.name[lang] }) });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setNotice(null);
    try {
      const s = await api.saveAvatar(draft);
      setState(s);
      setDraft(s.avatar);
      setLook(s.avatar);
      setNotice({ ok: true, text: t('wardrobe.saved') });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const options = COSMETICS.filter((c) => c.slot === slot);

  return (
    <div className="stack">
      <div className="wardrobe-stage">
        <Avatar look={draft} walking size={120} title={t('wardrobe.preview')} />
        <p className="gold-line" aria-label={t('wardrobe.goldLabel', { gold: state.gold })}>
          {t('wardrobe.gold', { gold: state.gold })}
        </p>
      </div>

      <div className="chips" role="group" aria-label={t('wardrobe.slots')}>
        {COSMETIC_SLOTS.map((s) => (
          <button key={s} type="button" aria-pressed={slot === s} onClick={() => setSlot(s)}>
            {t(`wardrobe.slot.${s}`)}
          </button>
        ))}
      </div>

      <ul className="wardrobe-grid" aria-label={t(`wardrobe.slot.${slot}`)}>
        {options.map((c) => {
          const wearing = draft[slot] === c.id;
          const mine = has(c);
          return (
            <li key={c.id}>
              <button
                type="button"
                className={wearing ? 'wardrobe-item wearing' : 'wardrobe-item'}
                aria-pressed={wearing}
                onClick={() => setDraft({ ...draft, [slot]: c.id })}
              >
                <Avatar look={{ ...draft, [slot]: c.id }} size={56} />
                <span className="wardrobe-name">{c.name[lang]}</span>
                <span className="muted small">
                  {c.price === 0
                    ? t('wardrobe.free')
                    : mine
                      ? t('wardrobe.owned')
                      : t('wardrobe.price', { price: c.price })}
                </span>
              </button>
              {!mine && (
                <button
                  type="button"
                  className="small"
                  disabled={busy || state.gold < c.price}
                  onClick={() => void buy(c)}
                >
                  {state.gold < c.price ? t('wardrobe.needGold') : t('wardrobe.buy')}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={notice.ok ? 'notice' : ''}>
          {notice.text}
        </p>
      )}
      {!wearable && <p className="muted">{t('wardrobe.tryingOn')}</p>}
      <div className="row">
        <button type="button" disabled={busy || !changed || !wearable} onClick={() => void save()}>
          {t('wardrobe.save')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !changed}
          onClick={() => setDraft(state.avatar)}
        >
          {t('wardrobe.undo')}
        </button>
      </div>
    </div>
  );
}
