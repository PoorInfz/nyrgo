import * as THREE from 'three';
import type { AvatarLook } from '@nyrgo/shared';
import { loadFigures, type Figures } from './assets';
import { Figure } from './explorer';

/**
 * The explorer in 3D outside the town: the wardrobe's turning stage, and still portraits of a
 * look (the wardrobe's item tiles). The same figures as in the town.
 */

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#5a5a7a', 1.7));
  const key = new THREE.DirectionalLight('#fff4e0', 2.2);
  key.position.set(3, 6, 5);
  const rim = new THREE.DirectionalLight('#92fde8', 1.1);
  rim.position.set(-4, 3, -4);
  scene.add(key, rim);
  return key;
}

/** The wardrobe's stage: the figure on a little plinth, turning slowly; drag to turn it. */
export class FigureStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private fig: Figure;
  private raf = 0;
  private last = performance.now();
  private spin = 0.5;
  /** Turn speed (radians per second); a drag sets it, and it settles back to a slow turn. */
  private velocity = 0.35;
  private dragging: { x: number; t: number } | null = null;
  private disposed = false;

  static async create(canvas: HTMLCanvasElement, look: AvatarLook): Promise<FigureStage> {
    return new FigureStage(canvas, await loadFigures(), look);
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    lib: Figures,
    look: AvatarLook,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    const key = lights(this.scene);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.65, 0.3, 40),
      new THREE.MeshLambertMaterial({ color: '#2b2560' }),
    );
    plinth.position.y = -0.15;
    plinth.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.05, 6, 48),
      new THREE.MeshLambertMaterial({ color: '#43f289', emissive: '#1a7a4a' }),
    );
    ring.rotation.x = Math.PI / 2;
    this.scene.add(plinth, ring);
    this.fig = new Figure(lib, look);
    this.fig.root.traverse((o) => (o.castShadow = true));
    this.scene.add(this.fig.root);
    this.camera.position.set(0, 2.1, 6.1);
    this.camera.lookAt(0, 1.35, 0);
    this.resize();
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private down = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.dragging = { x: e.clientX, t: performance.now() };
  };
  private move = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragging.x;
    const now = performance.now();
    this.spin += dx * 0.012;
    this.velocity = (dx * 0.012) / Math.max(0.016, (now - this.dragging.t) / 1000);
    this.dragging = { x: e.clientX, t: now };
  };
  private up = () => {
    this.dragging = null;
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.dragging) {
      this.spin += this.velocity * dt;
      this.velocity += (0.35 - this.velocity) * Math.min(1, dt * 2);
    }
    this.fig.root.rotation.y = this.spin;
    this.fig.update(dt, now, 0);
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio()))
      this.resize();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** A new look, with a little cheer to show it off. */
  setLook(look: AvatarLook) {
    this.fig.setLook(look);
    this.fig.root.traverse((o) => (o.castShadow = true));
    this.fig.emote('laugh', performance.now());
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.fig.dispose();
    this.renderer.dispose();
  }
}

/** One renderer for every portrait, drawing them one after another. */
let shared: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} | null = null;
let queue: Promise<unknown> = Promise.resolve();
const portraits = new Map<string, Promise<string>>();
const SIZE = 160;

/**
 * A still picture of a look (a PNG data URL), facing the viewer a little turned: the
 * wardrobe's item tiles. `close` frames the head and shoulders (hair, hats, glasses).
 */
export function portrait(look: AvatarLook, close: boolean): Promise<string> {
  const key = `${close ? 'c' : 'f'}|${JSON.stringify(look)}`;
  let p = portraits.get(key);
  if (!p) {
    p = (queue = queue.then(async () => {
      const lib = await loadFigures();
      if (!shared) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = SIZE;
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(SIZE, SIZE, false);
        const scene = new THREE.Scene();
        lights(scene);
        shared = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 50) };
      }
      const { renderer, scene, camera } = shared;
      const fig = new Figure(lib, look);
      fig.root.rotation.y = 0.35;
      scene.add(fig.root);
      fig.update(0.4, performance.now(), 0);
      if (close) {
        camera.position.set(0, 2.45, 4.1);
        camera.lookAt(0, 2.0, 0);
      } else {
        camera.position.set(0, 1.8, 6.6);
        camera.lookAt(0, 1.3, 0);
      }
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      fig.dispose();
      return url;
    })) as Promise<string>;
    portraits.set(key, p);
    p.catch(() => portraits.delete(key));
  }
  return p;
}
