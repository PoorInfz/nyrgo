import type { FastifyInstance } from 'fastify';
import {
  CONTENT_VERSION,
  CREATURES,
  ELEMENTS,
  ELEMENT_INFO,
  ITEMS,
  PASSIVES_BY_ID,
  RECIPES,
  SKILLS,
  STRONG_AGAINST,
  weakAgainst,
} from '@nyrgo/shared';

/**
 * Public game content: the encyclopedia, items and recipes. Same for every player, so it is
 * built once and served with an ETag tied to the content version.
 */
export function buildDex() {
  return {
    version: CONTENT_VERSION,
    elements: ELEMENTS.map((id) => ({
      id,
      name: { es: ELEMENT_INFO[id].es, en: ELEMENT_INFO[id].en },
      color: ELEMENT_INFO[id].color,
      strongAgainst: STRONG_AGAINST[id],
      weakAgainst: weakAgainst(id),
    })),
    skills: SKILLS,
    creatures: CREATURES.map((c) => ({
      id: c.id,
      dex: c.dex,
      name: c.name,
      element: c.element,
      rarity: c.rarity,
      stage: c.stage,
      stats: c.stats,
      skills: c.skills,
      passive: PASSIVES_BY_ID.get(c.passive),
      wild: c.wild,
      starter: c.starter,
      evolution: c.evolution,
      lore: c.lore,
      art: `/creatures/${c.id}.webp`,
      thumb: `/creatures/${c.id}-thumb.webp`,
    })),
    items: ITEMS,
    recipes: RECIPES,
  };
}

export async function contentRoutes(app: FastifyInstance) {
  const body = JSON.stringify(buildDex());
  const etag = `"content-v${CONTENT_VERSION}"`;

  app.get('/v1/dex', async (req, reply) => {
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply
      .header('etag', etag)
      .header('cache-control', 'public, max-age=3600')
      .type('application/json')
      .send(body);
  });
}
