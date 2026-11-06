import React from 'react';
import { PASTEL_PALETTE } from '../data/defaultCatalog';

export default function PosterCanvas({
  previewRef,
  selectedSkins,
  heroesById,
  layout,
}) {
  const columns = layout?.columns || 10;

  return (
    <div
      className="seamlessGridCanvas"
      ref={previewRef}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {selectedSkins.map((item, idx) => {
        const heroObj = heroesById[item.heroId];
        const displayImg = item.image || heroObj?.image || '';
        const fallbackBg =
          heroObj?.color || PASTEL_PALETTE[idx % PASTEL_PALETTE.length];

        return (
          <div
            key={item.uid}
            className="seamlessSkinTile"
            style={{ background: fallbackBg }}
          >
            {displayImg && (
              <img
                src={displayImg}
                alt=""
                referrerPolicy="no-referrer"
                draggable={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
