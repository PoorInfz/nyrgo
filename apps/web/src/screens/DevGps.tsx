import { useState } from 'react';
import type { SimulatorControls } from '../geo/location';
import { PLACES, ROUTES, SPEEDS_KMH } from '../geo/presets';

/**
 * GPS simulator controls. Rendered only in development builds (`import.meta.env.DEV`), so the
 * code is dropped from production bundles. Deliberately in English: it is a tool, not game UI.
 */
export function DevGps({ sim }: { sim: SimulatorControls }) {
  const [route, setRoute] = useState(ROUTES[0]!.id);
  const [speed, setSpeed] = useState<number>(SPEEDS_KMH[0].kmh);

  return (
    <details className="card devtools" open>
      <summary>GPS simulator (dev only)</summary>
      <div className="stack">
        <div className="chips" role="group" aria-label="Teleport">
          {PLACES.map((p) => (
            <button key={p.id} type="button" onClick={() => sim.teleport(p.at)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="row">
          <label>
            Route
            <select value={route} onChange={(e) => setRoute(e.target.value)}>
              {ROUTES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS_KMH.map((s) => (
                <option key={s.id} value={s.kmh}>
                  {s.id} · {s.kmh} km/h
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            onClick={() => sim.play(ROUTES.find((r) => r.id === route)!.points, speed)}
          >
            Play route
          </button>
          <button type="button" onClick={() => sim.pause()}>
            Stop
          </button>
        </div>
        <div className="row">
          <button type="button" onClick={() => sim.setAccuracy(5)}>
            Good fix (5 m)
          </button>
          <button type="button" onClick={() => sim.setAccuracy(120)}>
            Poor fix (120 m)
          </button>
        </div>
      </div>
    </details>
  );
}
