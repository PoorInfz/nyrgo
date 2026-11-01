import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * The 3D town's models (built by tools/town3d-assets.mts from KayKit packs, CC0 by Kay
 * Lousberg): loaded once per session and shared by every figure and building.
 */

export interface Library {
  /** Body parts by mesh name (Knight_Head, Mage_Body, …), each as loaded. */
  parts: Map<string, THREE.Mesh>;
  /** The rig every part is skinned to, with its bones, to be cloned per figure. */
  rig: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** Each pack character's texture, by character (Knight, Mage, Rogue, Barbarian). */
  textures: Map<string, HTMLImageElement | ImageBitmap>;
  /** Town models by id (gym, market, tree-a, …). */
  town: Map<string, THREE.Object3D>;
}

let loading: Promise<Library> | null = null;

const BASE = '/town3d/';

export function loadLibrary(): Promise<Library> {
  loading ??= load().catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

async function load(): Promise<Library> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [explorer, town] = await Promise.all([
    loader.loadAsync(`${BASE}explorer.glb`),
    loader.loadAsync(`${BASE}town.glb`),
  ]);
  return { ...explorerParts(explorer), town: townModels(town) };
}

function explorerParts(gltf: GLTF) {
  const parts = new Map<string, THREE.Mesh>();
  const textures = new Map<string, HTMLImageElement | ImageBitmap>();
  for (const scene of gltf.scenes) {
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!parts.has(o.name)) parts.set(o.name, o);
      const map = (o.material as THREE.MeshStandardMaterial).map;
      const char = o.name.split('_')[0]!;
      if (map?.image && ['Knight', 'Mage', 'Rogue', 'Barbarian'].includes(char))
        if (!textures.has(char)) textures.set(char, map.image as HTMLImageElement);
    });
  }
  // the knight's scene is the rig: its bones, without its meshes
  const knight = gltf.scenes.find((s) => s.name === 'Knight') ?? gltf.scenes[0]!;
  const rig = knight.getObjectByName('Rig') ?? knight;
  return {
    parts,
    rig,
    clips: new Map(gltf.animations.map((a) => [a.name, a])),
    textures,
  };
}

function townModels(gltf: GLTF) {
  const town = new Map<string, THREE.Object3D>();
  for (const child of gltf.scene.children) town.set(child.name, child);
  return town;
}
