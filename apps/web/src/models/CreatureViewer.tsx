import { useEffect, useRef, useState } from 'react';

/**
 * Turntable view of one creature's GLB. three.js is loaded lazily (it is only needed here)
 * and the spin stops for players who prefer reduced motion.
 */
export default function CreatureViewer({
  url,
  label,
  fallback,
}: {
  url: string;
  label: string;
  fallback: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => undefined as void;
    void (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const el = host.current;
        if (disposed || !el) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        const size = () => [el.clientWidth || 280, el.clientHeight || 240] as const;
        renderer.setSize(...size());
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.6));
        const sun = new THREE.DirectionalLight(0xffffff, 1.8);
        sun.position.set(2, 3, 4);
        scene.add(sun);

        const [w, h] = size();
        const camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 50);
        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) {
          renderer.dispose();
          return;
        }
        const model = gltf.scene;
        scene.add(model);

        // Frame the model: centre it on its vertical axis and back the camera off to fit.
        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        const extent = box.getSize(new THREE.Vector3());
        model.position.x -= centre.x;
        model.position.z -= centre.z;
        const radius = Math.max(extent.x, extent.y, extent.z) * 0.75;
        const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.set(0, centre.y + radius * 0.35, dist * 1.15);
        camera.lookAt(0, centre.y, 0);

        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        let frame = 0;
        const loop = () => {
          if (!still) model.rotation.y += 0.01;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(loop);
        };
        loop();

        cleanup = () => {
          cancelAnimationFrame(frame);
          renderer.dispose();
          scene.traverse((o) => {
            const mesh = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
            mesh.geometry?.dispose();
            mesh.material?.dispose();
          });
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [url]);

  return (
    <div ref={host} className="viewer" role="img" aria-label={label}>
      {failed && <p className="muted">{fallback}</p>}
    </div>
  );
}
