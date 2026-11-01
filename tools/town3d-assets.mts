/**
 * Builds the 3D town's models from KayKit packs (CC0, by Kay Lousberg, kaylousberg.com) into
 * apps/web/public/town3d/:
 *
 * - explorer.glb: every body part of the Adventurers pack (heads, bodies, arms, legs, hats,
 *   capes, a few hand items) on their shared rig, plus the animations the town uses. The game
 *   builds each player's figure from these parts.
 * - town.glb: the buildings, trees and props of the square, one named root node per model.
 *
 * The packs are not kept in the repository. To rebuild:
 *
 *   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 /tmp/kaykit/adv
 *   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 /tmp/kaykit/hex
 *   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0 /tmp/kaykit/city
 *   KAYKIT=/tmp/kaykit pnpm exec tsx tools/town3d-assets.mts
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  mergeDocuments,
  meshopt,
  prune,
  unpartition,
  resample,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = process.env.KAYKIT ?? '/tmp/kaykit';
const OUT = path.resolve(import.meta.dirname, '../apps/web/public/town3d');
const ADV = `${ROOT}/adv/addons/kaykit_character_pack_adventures/Characters/gltf`;
const HEX = `${ROOT}/hex/addons/kaykit_medieval_hexagon_pack/Assets/gltf`;
const CITY = `${ROOT}/city/addons/kaykit_city_builder_bits/Assets/gltf`;

/** The clips the town plays (the rest of the pack's 76 are combat moves). */
export const CLIPS = [
  'Idle',
  'Walking_A',
  'Running_A',
  'Cheer',
  'Interact',
  'Use_Item',
  'PickUp',
  'Hit_B',
  'Sit_Floor_Down',
  'Sit_Floor_Idle',
  'Jump_Full_Short',
  'Spellcast_Raise',
];

/** Hand items kept (no weapons in the town). */
const HAND_ITEMS = new Set(['Mug', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff']);

/** Town models: our id → source file. */
const TOWN: Record<string, string> = {
  gym: `${HEX}/buildings/blue/building_archeryrange_blue.gltf`,
  arena: `${HEX}/buildings/blue/building_barracks_blue.gltf`,
  market: `${HEX}/buildings/blue/building_market_blue.gltf`,
  'house-red': `${HEX}/buildings/red/building_home_B_red.gltf`,
  'house-blue': `${HEX}/buildings/blue/building_home_A_blue.gltf`,
  'house-purple': `${HEX}/buildings/yellow/building_home_B_yellow.gltf`,
  'house-green': `${HEX}/buildings/green/building_home_A_green.gltf`,
  tavern: `${HEX}/buildings/yellow/building_tavern_yellow.gltf`,
  windmill: `${HEX}/buildings/green/building_windmill_green.gltf`,
  church: `${HEX}/buildings/red/building_church_red.gltf`,
  blacksmith: `${HEX}/buildings/red/building_blacksmith_red.gltf`,
  well: `${HEX}/buildings/blue/building_well_blue.gltf`,
  'tree-a': `${HEX}/decoration/nature/tree_single_A.gltf`,
  'tree-b': `${HEX}/decoration/nature/tree_single_B.gltf`,
  'trees-a': `${HEX}/decoration/nature/trees_A_medium.gltf`,
  'trees-b': `${HEX}/decoration/nature/trees_B_large.gltf`,
  'trees-small': `${HEX}/decoration/nature/trees_B_small.gltf`,
  'hills-trees': `${HEX}/decoration/nature/hills_A_trees.gltf`,
  'hills-b': `${HEX}/decoration/nature/hills_B_trees.gltf`,
  mountain: `${HEX}/decoration/nature/mountain_A_grass_trees.gltf`,
  'mountain-b': `${HEX}/decoration/nature/mountain_B_grass.gltf`,
  'rock-a': `${HEX}/decoration/nature/rock_single_A.gltf`,
  'rock-c': `${HEX}/decoration/nature/rock_single_C.gltf`,
  cloud: `${HEX}/decoration/nature/cloud_big.gltf`,
  'cloud-small': `${HEX}/decoration/nature/cloud_small.gltf`,
  barrel: `${HEX}/decoration/props/barrel.gltf`,
  crates: `${HEX}/decoration/props/crate_A_big.gltf`,
  'crate-small': `${HEX}/decoration/props/crate_B_small.gltf`,
  sack: `${HEX}/decoration/props/sack.gltf`,
  tent: `${HEX}/decoration/props/tent.gltf`,
  flag: `${HEX}/decoration/props/flag_blue.gltf`,
  'flag-red': `${HEX}/decoration/props/flag_red.gltf`,
  wheelbarrow: `${HEX}/decoration/props/wheelbarrow.gltf`,
  bucket: `${HEX}/decoration/props/bucket_water.gltf`,
  'fence-wood': `${HEX}/buildings/neutral/fence_wood_straight.gltf`,
  'fence-stone': `${HEX}/buildings/neutral/fence_stone_straight.gltf`,
  stage: `${HEX}/buildings/neutral/building_stage_A.gltf`,
  waterlily: `${HEX}/decoration/nature/waterlily_A.gltf`,
  streetlight: `${CITY}/streetlight.gltf`,
  bench: `${CITY}/bench.gltf`,
  bush: `${CITY}/bush.gltf`,
};

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

async function write(doc: Document, name: string) {
  await doc.transform(dedup(), weld(), resample(), prune({ keepLeaves: true }), unpartition());
  // a round trip drops what earlier disposals left dangling in memory (unused accessors)
  const clean = await io.readBinary(await io.writeBinary(doc));
  await clean.transform(
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  mkdirSync(OUT, { recursive: true });
  await io.write(`${OUT}/${name}`, clean);
}

async function explorer() {
  await MeshoptEncoder.ready;
  // the knight's file is the base: its rig and animations
  const doc = await io.read(`${ADV}/Knight.glb`);
  for (const a of doc.getRoot().listAnimations()) if (!CLIPS.includes(a.getName())) a.dispose();
  const keep = (n: Node, char: string) => {
    const name = n.getName();
    if (!n.getMesh()) return true;
    if (HAND_ITEMS.has(name)) return true;
    // the hooded rogue only adds its head
    if (char === 'Rogue_Hooded') return name === 'Rogue_Head_Hooded';
    return name.startsWith(`${char.split('_')[0]}_`);
  };
  for (const n of doc.getRoot().listNodes()) if (!keep(n, 'Knight')) n.dispose();
  doc.getRoot().listScenes()[0]!.setName('Knight');

  for (const char of ['Mage', 'Rogue', 'Rogue_Hooded', 'Barbarian']) {
    const src = await io.read(`${ADV}/${char}.glb`);
    for (const a of src.getRoot().listAnimations()) a.dispose();
    for (const n of src.getRoot().listNodes()) if (!keep(n, char)) n.dispose();
    src.getRoot().listScenes()[0]!.setName(char);
    mergeDocuments(doc, src);
  }
  // hand items repeat across characters: keep the first of each name
  const seen = new Set<string>();
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh() || !HAND_ITEMS.has(n.getName())) continue;
    if (seen.has(n.getName())) n.dispose();
    seen.add(n.getName());
  }
  await write(doc, 'explorer.glb');
}

async function town() {
  const doc = new Document();
  const scene = doc.createScene('town');
  for (const [id, file] of Object.entries(TOWN)) {
    const src = await io.read(file);
    const map = mergeDocuments(doc, src);
    for (const s of src.getRoot().listScenes()) {
      const merged = map.get(s) as ReturnType<Document['createScene']>;
      const holder = doc.createNode(id);
      for (const child of merged.listChildren()) {
        merged.removeChild(child);
        holder.addChild(child);
      }
      scene.addChild(holder);
      merged.dispose();
    }
  }
  // every hexagon model points at its own copy of the same texture: dedup joins them
  await write(doc, 'town.glb');
}

await explorer();
await town();
console.warn('written to', OUT);
