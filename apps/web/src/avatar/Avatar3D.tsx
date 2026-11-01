import { useEffect, useRef, useState } from 'react';
import type { AvatarLook } from '@nyrgo/shared';
import type { FigureStage } from '../town3d/stage';
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

/** A still 3D picture of a look (the wardrobe's tiles); the drawn explorer until it is ready. */
export function Portrait({
  look,
  close,
  size,
}: {
  look: AvatarLook;
  close: boolean;
  size: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify(look) + close;
  useEffect(() => {
    if (!canRender3d()) return;
    let live = true;
    import('../town3d/stage')
      .then((m) => m.portrait(look, close))
      .then((u) => live && setUrl(u))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // the key stands for the look's contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (url) return <img src={url} width={size} height={size} alt="" className="portrait3d" />;
  if (canRender3d())
    return <span className="portrait3d loading" style={{ width: size, height: size }} />;
  return <Avatar look={look} size={size} />;
}
