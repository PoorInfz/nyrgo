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
    this.camera.position.set(0, 2.3, 6.6);
    this.camera.lookAt(0, 1.15, 0);
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
  /** One figure re-dressed for each picture (cloning a rig per picture is the slow part). */
  fig: Figure;
} | null = null;
let queue: Promise<unknown> = Promise.resolve();
const portraits = new Map<string, Promise<ImageBitmap>>();
/** Portrait size in pixels: sharp on a 3× phone screen at the tiles' 72 px. */
const SIZE = 224;

/**
 * A still picture of a look (a bitmap to draw on a canvas), facing the viewer a little turned: the
 * wardrobe's item tiles. `close` frames the head and shoulders (hair, hats, glasses).
 */
export function portrait(look: AvatarLook, close: boolean): Promise<ImageBitmap> {
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
        const fig = new Figure(lib, look);
        fig.root.rotation.y = 0.3;
        scene.add(fig.root);
        shared = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 50), fig };
      }
      const { renderer, scene, camera, fig } = shared;
      fig.setLook(look);
      fig.pose(0.4);
      // frame what this look really fills: tall hats, a bun or curls need room above the head
      fig.root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      fig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).computeBoundingBox();
        else m.geometry.computeBoundingBox();
        const b = (m as THREE.SkinnedMesh).isSkinnedMesh
          ? (m as THREE.SkinnedMesh).boundingBox!.clone().applyMatrix4(m.matrixWorld)
          : m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
        box.union(b);
      });
      const top = Math.min(box.max.y, 4) + 0.08;
      const bottom = close ? 1.12 : -0.05;
      const h = top - bottom;
      const mid = (top + bottom) / 2;
      const dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) + 0.6;
      camera.position.set(0, mid + 0.25, dist);
      camera.lookAt(0, mid, 0);
      renderer.render(scene, camera);
      // a bitmap, not an encoded image: copying the pixels is quick, encoding a PNG is not
      const pic = await createImageBitmap(renderer.domElement);
      return pic;
    })) as Promise<ImageBitmap>;
    portraits.set(key, p);
    p.catch(() => portraits.delete(key));
  }
  return p;
}

/**
 * The explorer walking on the map: a small transparent 3D view inside the map's marker. It walks
 * or stands, turned the way it goes, and draws at most 30 times a second (and not at all while
 * the page is hidden), to spare the battery.
 */
export class LiveFigure {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
  private fig: Figure;
  private raf = 0;
  private last = 0;
  private drawn = 0;
  private walking = false;
  private yaw = 0.6;
  private yawTo = 0.6;
  private disposed = false;

  static async create(canvas: HTMLCanvasElement, look: AvatarLook): Promise<LiveFigure> {
    return new LiveFigure(canvas, await loadFigures(), look);
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    lib: Figures,
    look: AvatarLook,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    lights(this.scene);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 24),
      new THREE.MeshBasicMaterial({ color: '#06222b', transparent: true, opacity: 0.3 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    this.scene.add(shadow);
    this.fig = new Figure(lib, look);
    this.scene.add(this.fig.root);
    this.camera.position.set(0, 3.2, 7.6);
    this.camera.lookAt(0, 1.25, 0);
    const r = canvas.getBoundingClientRect();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
    this.raf = requestAnimationFrame(this.frame);
  }

  setLook(look: AvatarLook) {
    this.fig.setLook(look);
  }

  /** Walking or standing, turned to the left or the right (three-quarters towards the viewer). */
  setMotion(walking: boolean, facing: 'left' | 'right') {
    this.walking = walking;
    this.yawTo = facing === 'left' ? -0.9 : 0.9;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || now - this.drawn < 32) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    this.drawn = now;
    this.yaw += (this.yawTo - this.yaw) * Math.min(1, dt * 8);
    this.fig.root.rotation.y = this.yaw;
    this.fig.update(dt, now, this.walking ? 1.9 : 0);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.fig.dispose();
    this.renderer.dispose();
  }
}
