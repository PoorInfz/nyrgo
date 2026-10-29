import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Api } from '../api';

const KEY = 'nyrgo_first_steps_done';

interface Progress {
  starter: boolean;
  seen: boolean;
  caught: boolean;
}

/**
 * The first-game guide: five real steps ticked off from the player's own state, dismissed by
 * the player or once everything is done. Nothing to remember on the server.
 */
export function FirstSteps({
  api,
  locationOn,
  visited,
  refresh,
}: {
  api: Api;
  locationOn: boolean;
  visited: boolean;
  refresh: number;
}) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    if (hidden) return;
    let live = true;
    Promise.all([api.myCreatures(), api.myDex()])
      .then(([mine, dex]) => {
        if (!live) return;
        const caught = mine.creatures.some((c) => c.acquiredVia === 'capture');
        setP({
          starter: mine.creatures.length > 0,
          // an opened encounter leaves a Dex entry without a catch; a catch implies one
          seen: caught || dex.entries.some((e) => e.caughtCount === 0),
          caught,
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, refresh, hidden]);

  if (hidden || !p) return null;
  const steps: [string, boolean][] = [
    ['starter', p.starter],
    ['location', locationOn],
    ['approach', p.seen],
    ['catch', p.caught],
    ['visit', visited],
  ];
  const allDone = steps.every(([, done]) => done);

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* fine: shown again next time */
    }
    setHidden(true);
  }

  return (
    <section className="card stack first-steps" aria-labelledby="steps-title">
      <h2 id="steps-title">{allDone ? t('steps.doneTitle') : t('steps.title')}</h2>
      <ol className="steps">
        {steps.map(([id, done]) => (
          <li key={id} className={done ? 'done' : ''}>
            <span className="check" aria-hidden="true">
              {done ? '✓' : ''}
            </span>
            <span>
              {t(`steps.${id}`)}
              {done && <span className="sr-only"> ({t('steps.done')})</span>}
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="link" onClick={dismiss}>
        {allDone ? t('steps.close') : t('steps.skip')}
      </button>
    </section>
  );
}
