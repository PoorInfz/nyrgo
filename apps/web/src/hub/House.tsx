import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FURNITURE_BY_ID, canStand, hubMap, houseRoomId } from '@nyrgo/shared';
import { ApiError, type Api, type HousePiece, type HousePrivacy, type HousesInfo } from '../api';

const errorKey = (e: unknown) => (e instanceof ApiError ? `errors.${e.code}` : 'errors.other');
const HOUSE = hubMap(houseRoomId('layout'))!;
const PRIVACY: HousePrivacy[] = ['private', 'friends', 'public'];

/** At a house door on the square: your own house, your friends', and those open to everyone. */
export function HousesPanel({
  api,
  me,
  onVisit,
}: {
  api: Api;
  me: string | null;
  onVisit: (owner: string) => void;
}) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<HousesInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api
      .hubHouses()
      .then((h) => live && setInfo(h))
      .catch((e) => live && setErr(errorKey(e)));
    return () => {
      live = false;
    };
  }, [api]);
  if (!info) return <p className="muted">{err ? t(err) : t('loading')}</p>;
  return (
    <div className="stack">
      <p className="small">{t('house.why')}</p>
      {me && (
        <button type="button" onClick={() => onVisit(me)}>
          {t('house.goHome')}
        </button>
      )}
      <h3>{t('house.friends')}</h3>
      {info.friends.length ? (
        <ul className="hub-list">
          {info.friends.map((f) => (
            <li key={f.id}>
              <span>{f.name}</span>
              <button type="button" className="small secondary" onClick={() => onVisit(f.id)}>
                {t('house.visit')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('house.noFriends')}</p>
      )}
      <h3>{t('house.open')}</h3>
      {info.open.length ? (
        <ul className="hub-list">
          {info.open.map((f) => (
            <li key={f.id}>
              <span>
                {f.name} <span className="muted small">{t('house.pieces', { n: f.pieces })}</span>
              </span>
              <button type="button" className="small secondary" onClick={() => onVisit(f.id)}>
                {t('house.visit')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('house.noneOpen')}</p>
      )}
    </div>
  );
}

/**
 * Decorating your own house: pick a piece you own and it goes where you stand; move by walking
 * and placing again. Every change is saved at once and everyone inside sees it.
 */
export function DecoratePanel({
  api,
  layout,
  spot,
  onSaved,
}: {
  api: Api;
  layout: HousePiece[];
  /** Where the player stands (feet), in house pixels. */
  spot: () => { x: number; y: number } | null;
  onSaved: (layout: HousePiece[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('es') ? 'es' : 'en';
  const [owned, setOwned] = useState<Record<string, number> | null>(null);
  const [privacy, setPrivacy] = useState<HousePrivacy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (f: string) => FURNITURE_BY_ID.get(f)?.name[lang] ?? f;

  useEffect(() => {
    let live = true;
    Promise.all([api.hubFurniture(), api.hubHouses()])
      .then(([f, h]) => {
        if (!live) return;
        setOwned(f.owned);
        setPrivacy(h.mine.privacy);
      })
      .catch((e) => live && setErr(errorKey(e)));
    return () => {
      live = false;
    };
  }, [api]);

  async function save(body: { layout?: HousePiece[]; privacy?: HousePrivacy }) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.hubSaveHouse(body);
      setPrivacy(r.privacy);
      onSaved(r.layout);
    } catch (e) {
      setErr(errorKey(e));
    } finally {
      setBusy(false);
    }
  }

  function place(f: string) {
    const at = spot();
    if (!at || !canStand(HOUSE, Math.round(at.x), Math.round(at.y))) {
      setErr('house.badSpot');
      return;
    }
    void save({
      layout: [...layout, { f, x: Math.round(at.x), y: Math.round(at.y), flip: false }],
    });
  }

  if (!owned || !privacy) return <p className="muted">{err ? t(err) : t('loading')}</p>;
  const used = (f: string) => layout.filter((p) => p.f === f).length;
  const free = Object.entries(owned).filter(([f, n]) => n - used(f) > 0);

  return (
    <div className="stack">
      <label>
        {t('house.privacy')}
        <select
          value={privacy}
          disabled={busy}
          onChange={(e) => void save({ privacy: e.target.value as HousePrivacy })}
        >
          {PRIVACY.map((p) => (
            <option key={p} value={p}>
              {t(`house.privacyOpt.${p}`)}
            </option>
          ))}
        </select>
      </label>
      {err && (
        <p className="error" role="alert">
          {t(err)}
        </p>
      )}
      <h3>{t('house.toPlace')}</h3>
      <p className="muted small">{t('house.placeHow')}</p>
      {free.length ? (
        <ul className="hub-furniture">
          {free.map(([f, n]) => (
            <li key={f}>
              <img src={`/hub/f-${f}.webp`} alt="" loading="lazy" />
              <span className="small">
                {name(f)} ×{n - used(f)}
              </span>
              <button
                type="button"
                className="small"
                disabled={busy || layout.length >= 30}
                onClick={() => place(f)}
              >
                {t('house.placeHere')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('house.nothingToPlace')}</p>
      )}
      {layout.length > 0 && (
        <>
          <h3>{t('house.placed', { n: layout.length })}</h3>
          <ul className="hub-list">
            {layout.map((p, i) => (
              <li key={`${p.f}-${i}`}>
                <span>{name(p.f)}</span>
                <span className="row">
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy}
                    aria-label={t('house.flipOf', { name: name(p.f) })}
                    onClick={() =>
                      void save({
                        layout: layout.map((q, j) => (j === i ? { ...q, flip: !q.flip } : q)),
                      })
                    }
                  >
                    ⇋
                  </button>
                  <button
                    type="button"
                    className="small secondary"
                    disabled={busy}
                    onClick={() => void save({ layout: layout.filter((_, j) => j !== i) })}
                  >
                    {t('house.remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
