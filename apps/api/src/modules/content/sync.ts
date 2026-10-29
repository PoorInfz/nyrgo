import { CONTENT_VERSION, CREATURES, ITEMS, RECIPES } from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';

export interface SyncReport {
  version: number;
  creatures: number;
  items: number;
  recipes: number;
  retired: number;
}

/**
 * Copies the content from @nyrgo/shared into the definition tables. Idempotent: safe on every
 * API start. Definitions that disappear from the code are marked `retired`, never deleted,
 * because players may own creatures or items that reference them.
 */
export async function syncContent(db: Db): Promise<SyncReport> {
  return withTx(db, async (c) => {
    // Serialize concurrent API starts.
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('content-sync'))`);

    await c.query(
      `INSERT INTO item_definitions (id, kind, rarity, effects, price, config_version, retired)
       SELECT id, kind, rarity, effects, price, $2, false
         FROM jsonb_to_recordset($1::jsonb)
           AS r(id text, kind text, rarity text, effects jsonb, price int)
       ON CONFLICT (id) DO UPDATE SET
         kind = EXCLUDED.kind, rarity = EXCLUDED.rarity, effects = EXCLUDED.effects,
         price = EXCLUDED.price, config_version = EXCLUDED.config_version, retired = false`,
      [JSON.stringify(ITEMS), CONTENT_VERSION],
    );

    const rows = CREATURES.map((x) => ({
      id: x.id,
      dex: x.dex,
      name: x.name,
      element: x.element,
      rarity: x.rarity,
      hp: x.stats.hp,
      atk: x.stats.atk,
      def: x.stats.def,
      spd: x.stats.spd,
      skills: x.skills,
      passive: x.passive,
      difficulty: x.captureDifficulty,
      biomes: x.biomes,
      stage: x.stage,
      archetype: x.archetype,
      wild: x.wild,
      starter: x.starter,
      lore: x.lore,
      evolves_to: x.evolution?.to ?? null,
      evolve_level: x.evolution?.level ?? null,
      evolve_hold_days: x.evolution?.holdDays ?? null,
      evolve_cost: x.evolution
        ? { gold: x.evolution.gold, materials: x.evolution.materials }
        : null,
    }));

    // Pass 1 without evolution links (the target row may not exist yet), pass 2 links them.
    // Dex numbers are cleared first so a reordering cannot collide on the unique index.
    await c.query(`UPDATE creature_definitions SET dex = NULL`);
    await c.query(
      `INSERT INTO creature_definitions
         (id, dex, name, element, rarity, base_hp, base_atk, base_def, base_spd, skills, passive,
          capture_difficulty, biomes, stage, archetype, wild, starter, lore_i18n,
          evolves_to, evolve_level, evolve_hold_days, evolve_cost, config_version, retired)
       SELECT id, dex, name, element, rarity, hp, atk, def, spd,
              ARRAY(SELECT jsonb_array_elements_text(skills)), passive, difficulty,
              ARRAY(SELECT jsonb_array_elements_text(biomes)), stage, archetype, wild, starter, lore,
              NULL, NULL, NULL, NULL, $2, false
         FROM jsonb_to_recordset($1::jsonb) AS r(
           id text, dex int, name text, element text, rarity text, hp int, atk int, def int, spd int,
           skills jsonb, passive text, difficulty int, biomes jsonb, stage int, archetype text,
           wild boolean, starter boolean, lore jsonb)
       ON CONFLICT (id) DO UPDATE SET
         dex = EXCLUDED.dex, name = EXCLUDED.name, element = EXCLUDED.element,
         rarity = EXCLUDED.rarity, base_hp = EXCLUDED.base_hp, base_atk = EXCLUDED.base_atk,
         base_def = EXCLUDED.base_def, base_spd = EXCLUDED.base_spd, skills = EXCLUDED.skills,
         passive = EXCLUDED.passive, capture_difficulty = EXCLUDED.capture_difficulty,
         biomes = EXCLUDED.biomes, stage = EXCLUDED.stage, archetype = EXCLUDED.archetype,
         wild = EXCLUDED.wild, starter = EXCLUDED.starter, lore_i18n = EXCLUDED.lore_i18n,
         evolves_to = NULL, evolve_level = NULL, evolve_hold_days = NULL, evolve_cost = NULL,
         config_version = EXCLUDED.config_version, retired = false`,
      [JSON.stringify(rows), CONTENT_VERSION],
    );
    await c.query(
      `UPDATE creature_definitions d SET
         evolves_to = r.evolves_to, evolve_level = r.evolve_level,
         evolve_hold_days = r.evolve_hold_days, evolve_cost = r.evolve_cost
         FROM jsonb_to_recordset($1::jsonb)
           AS r(id text, evolves_to text, evolve_level int, evolve_hold_days int, evolve_cost jsonb)
        WHERE d.id = r.id AND r.evolves_to IS NOT NULL`,
      [JSON.stringify(rows)],
    );

    await c.query(
      `INSERT INTO recipes (id, inputs, gold_cost, output_item, unlock_level, config_version, retired)
       SELECT id, inputs, gold, output, "unlockLevel", $2, false
         FROM jsonb_to_recordset($1::jsonb)
           AS r(id text, inputs jsonb, gold int, output text, "unlockLevel" int)
       ON CONFLICT (id) DO UPDATE SET
         inputs = EXCLUDED.inputs, gold_cost = EXCLUDED.gold_cost,
         output_item = EXCLUDED.output_item, unlock_level = EXCLUDED.unlock_level,
         config_version = EXCLUDED.config_version, retired = false`,
      [JSON.stringify(RECIPES), CONTENT_VERSION],
    );

    let retired = 0;
    for (const [table, ids] of [
      ['creature_definitions', CREATURES.map((x) => x.id)],
      ['item_definitions', ITEMS.map((x) => x.id)],
      ['recipes', RECIPES.map((x) => x.id)],
    ] as const) {
      const r = await c.query(
        `UPDATE ${table} SET retired = true WHERE NOT retired AND NOT (id = ANY($1::text[]))`,
        [ids],
      );
      retired += r.rowCount ?? 0;
    }

    await c.query(
      `INSERT INTO config_versions (scope, payload, active_from)
       SELECT 'content', jsonb_build_object('version', $1::int), now()
        WHERE NOT EXISTS (
          SELECT 1 FROM config_versions WHERE scope = 'content' AND (payload->>'version')::int = $1)`,
      [CONTENT_VERSION],
    );

    return {
      version: CONTENT_VERSION,
      creatures: CREATURES.length,
      items: ITEMS.length,
      recipes: RECIPES.length,
      retired,
    };
  });
}
