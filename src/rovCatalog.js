/**
 * RoV catalog seed data.
 * Stable IDs allow future API/database records to reference heroes and skins.
 * Artwork URLs stay null until approved image assets are available.
 */
export const heroCatalog = [
  { id: 'alice', name: 'Alice', role: 'Support', lane: 'Roaming', image: null, skins: [
    { id: 'alice-little-lady', name: 'Little Lady', rarity: 'Limited', image: null },
    { id: 'alice-sweet-dreams', name: 'Sweet Dreams', rarity: 'Rare', image: null },
    { id: 'alice-moonlight', name: 'Moonlight', rarity: 'Epic', image: null },
  ]},
  { id: 'aoi', name: 'Aoi', role: 'Assassin', lane: 'Jungle', image: null, skins: [
    { id: 'aoi-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'aoi-dragon-slayer', name: 'Dragon Slayer', rarity: 'Epic', image: null },
    { id: 'aoi-celestial', name: 'Celestial', rarity: 'Limited', image: null },
  ]},
  { id: 'allain', name: 'Allain', role: 'Warrior', lane: 'Dark Slayer', image: null, skins: [
    { id: 'allain-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'allain-snow-angel', name: 'Snow Angel', rarity: 'Epic', image: null },
    { id: 'allain-dimension-breaker', name: 'Dimension Breaker', rarity: 'Legendary', image: null },
  ]},
  { id: 'butterfly', name: 'Butterfly', role: 'Assassin', lane: 'Jungle', image: null, skins: [
    { id: 'butterfly-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'butterfly-floral-elf', name: 'Floral Elf', rarity: 'Rare', image: null },
    { id: 'butterfly-summer-bash', name: 'Summer Bash', rarity: 'Epic', image: null },
  ]},
  { id: 'krixi', name: 'Krixi', role: 'Mage', lane: 'Mid', image: null, skins: [
    { id: 'krixi-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'krixi-wonderland', name: 'Wonderland', rarity: 'Epic', image: null },
    { id: 'krixi-crescent-moon', name: 'Crescent Moon', rarity: 'Limited', image: null },
  ]},
  { id: 'lauriel', name: 'Lauriel', role: 'Mage', lane: 'Mid', image: null, skins: [
    { id: 'lauriel-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'lauriel-angel-of-light', name: 'Angel of Light', rarity: 'Legendary', image: null },
    { id: 'lauriel-crystal', name: 'Crystal', rarity: 'Epic', image: null },
  ]},
  { id: 'violet', name: 'Violet', role: 'Marksman', lane: 'Dragon Lane', image: null, skins: [
    { id: 'violet-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'violet-summer-bash', name: 'Summer Bash', rarity: 'Epic', image: null },
    { id: 'violet-dimension-breaker', name: 'Dimension Breaker', rarity: 'Legendary', image: null },
  ]},
  { id: 'yena', name: 'Yena', role: 'Warrior', lane: 'Dark Slayer', image: null, skins: [
    { id: 'yena-default', name: 'Default', rarity: 'Normal', image: null },
    { id: 'yena-moonlight', name: 'Moonlight', rarity: 'Epic', image: null },
    { id: 'yena-celestial', name: 'Celestial', rarity: 'Limited', image: null },
  ]},
];

export const catalogStats = {
  heroCount: heroCatalog.length,
  skinCount: heroCatalog.reduce((sum, hero) => sum + hero.skins.length, 0),
};
