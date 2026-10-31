import type { HubSprite } from '../hub/art.js';

/**
 * Furniture for houses: bought with Gold in the town (from the merchant) and placed by the owner.
 * Rugs lie under everything; the rest stands on the floor and is sorted with people. Decoration
 * only: nobody bumps into furniture, so a layout can never block the door.
 */
export interface FurnitureDef {
  id: string;
  sprite: HubSprite;
  price: number;
  rug?: boolean;
  name: { es: string; en: string };
}

const F = (id: string, price: number, es: string, en: string, rug = false): FurnitureDef => ({
  id,
  sprite: `f-${id}` as HubSprite,
  price,
  name: { es, en },
  ...(rug ? { rug } : {}),
});

export const FURNITURE: FurnitureDef[] = [
  F('plant-small', 40, 'Planta pequeña', 'Small plant'),
  F('barrel', 40, 'Barril', 'Barrel'),
  F('stool-red', 50, 'Taburete rojo', 'Red stool'),
  F('chair-wood', 60, 'Silla de madera', 'Wooden chair'),
  F('chair-blue', 70, 'Silla azul', 'Blue chair'),
  F('plant-white', 70, 'Maceta blanca', 'White pot plant'),
  F('plant-flowers', 90, 'Planta con flores', 'Flowering plant'),
  F('nightstand', 80, 'Mesilla', 'Nightstand'),
  F('rug-red', 90, 'Alfombra roja', 'Red rug', true),
  F('rug-blue', 110, 'Alfombra azul', 'Blue rug', true),
  F('rug-purple', 110, 'Alfombra morada', 'Purple rug', true),
  F('banner-red', 100, 'Estandarte rojo', 'Red banner'),
  F('banner-gold', 100, 'Estandarte dorado', 'Gold banner'),
  F('shelf-small', 110, 'Estantería pequeña', 'Small shelf'),
  F('table-round', 150, 'Mesa redonda', 'Round table'),
  F('sofa-cream', 160, 'Banco tapizado', 'Upholstered bench'),
  F('sofa-blue', 160, 'Sofá azul', 'Blue sofa'),
  F('sofa-white', 170, 'Sillón blanco', 'White armchair'),
  F('loveseat-red', 180, 'Sofá pequeño rojo', 'Red loveseat'),
  F('sofa-red', 220, 'Sofá rojo', 'Red sofa'),
  F('dresser', 180, 'Cómoda', 'Dresser'),
  F('bookcase', 200, 'Librería', 'Bookcase'),
  F('noticeboard', 160, 'Tablón de notas', 'Notice board'),
  F('bed-red', 240, 'Cama roja', 'Red bed'),
  F('bed-blue', 240, 'Cama azul', 'Blue bed'),
  F('tv', 260, 'Televisor', 'Television'),
  F('computer', 280, 'Ordenador', 'Computer'),
  F('aquarium', 300, 'Acuario', 'Aquarium'),
  F('water-cooler', 120, 'Fuente de agua', 'Water cooler'),
  F('trophy', 350, 'Trofeo', 'Trophy'),
  F('clock', 320, 'Reloj de pie', 'Grandfather clock'),
  F('arcade', 400, 'Máquina recreativa', 'Arcade machine'),
  F('crystal', 450, 'Cristal brillante', 'Glowing crystal'),
];

export const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
