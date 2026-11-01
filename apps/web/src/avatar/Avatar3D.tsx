import { useEffect, useRef, useState } from 'react';
import type { AvatarLook } from '@nyrgo/shared';
import type { FigureStage, LiveFigure } from '../town3d/stage';
import { Avatar } from './Avatar';

/**
 * The explorer in 3D for the wardrobe: the same figure players see in the town. The 3D code and
 * models load on demand; where WebGL is missing (or fails) the drawn explorer stays.
 */

let webgl: boolean | null = null;
export function canRender3d(): boolean {
  if (webgl === null) {
    try {
      webgl = !!document.createElement('canvas').getContext('webgl2');
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** A turning 3D stage with the explorer on it; drag to turn it round. */
export function ExplorerStage({ look, label }: { look: AvatarLook; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<FigureStage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(() =>
    canRender3d() ? 'loading' : 'failed',
  );
  const lookRef = useRef(look);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !canRender3d()) return;
    let live = true;
    import('../town3d/stage')
      .then((m) => m.FigureStage.create(el, lookRef.current))
      .then((s) => {
        if (!live) return s.dispose();
        stage.current = s;
        setState('ready');
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
      stage.current?.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    lookRef.current = look;
    stage.current?.setLook(look);
  }, [look]);

  return (
    <div className={`explorer-stage ${state}`}>
      {state !== 'failed' && (
        <canvas ref={canvas} role="img" aria-label={label} hidden={state !== 'ready'} />
      )}
      {state !== 'ready' && <Avatar look={look} walking size={120} title={label} />}
    </div>
  );
}

/** A still 3D picture of a look (the wardrobe's tiles, the rankings); a soft blank until ready. */
export function Portrait({
  look,
  close,
  size,
}: {
  look: AvatarLook;
  close: boolean;
  size: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify(look) + close;
  useEffect(() => {
    if (!canRender3d()) return;
    let live = true;
    import('../town3d/stage')
      .then((m) => m.portrait(look, close))
      .then((pic) => {
        const el = canvas.current;
        if (!live || !el) return;
        el.width = pic.width;
        el.height = pic.height;
        const ctx = el.getContext('2d');
        ctx?.clearRect(0, 0, el.width, el.height);
        ctx?.drawImage(pic, 0, 0);
        setReady(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // the key stands for the look's contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!canRender3d()) return <Avatar look={look} size={size} />;
  return (
    <canvas
      ref={canvas}
      className={ready ? 'portrait3d' : 'portrait3d loading'}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/** The explorer walking on the map, in 3D; the drawn one where 3D cannot run. */
export function LiveExplorer({
  look,
  walking,
  facing,
  size,
}: {
  look: AvatarLook;
  walking: boolean;
  facing: 'left' | 'right';
  size: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fig = useRef<LiveFigure | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(() =>
    canRender3d() ? 'loading' : 'failed',
  );
  const now = useRef({ look, walking, facing });
  useEffect(() => {
    now.current = { look, walking, facing };
  }, [look, walking, facing]);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !canRender3d()) return;
    let live = true;
    import('../town3d/stage')
      .then((m) => m.LiveFigure.create(el, now.current.look))
      .then((f) => {
        if (!live) return f.dispose();
        f.setMotion(now.current.walking, now.current.facing);
        fig.current = f;
        setState('ready');
      })
      .catch(() => live && setState('failed'));
    return () => {
      live = false;
      fig.current?.dispose();
      fig.current = null;
    };
  }, []);

  useEffect(() => {
    fig.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    fig.current?.setMotion(walking, facing);
  }, [walking, facing]);

  const h = Math.round(size * 1.35);
  return (
    <span className="live-explorer" style={{ width: size, height: h }}>
      {state !== 'failed' && (
        <canvas ref={canvas} style={{ width: size, height: h }} hidden={state !== 'ready'} />
      )}
      {state !== 'ready' && <Avatar look={look} walking={walking} facing={facing} size={size} />}
    </span>
  );
}
