import React from 'react';
import { POSTER_THEMES, PASTEL_PALETTE } from '../data/defaultCatalog';

export default function PosterCanvas({
  previewRef,
  selectedSkins,
  heroesById,
  posterMode,
  accountInfo,
  watermark,
  layout,
}) {
  const theme =
    POSTER_THEMES.find((t) => t.id === layout.themeId) || POSTER_THEMES[0];

  // Build tiled watermark array if needed
  const tiledItems = Array.from({ length: 18 }, (_, i) => i);

  return (
    <div
      className="posterCanvas"
      ref={previewRef}
      style={{
        background: theme.gradient,
        borderColor: theme.cardBorder,
      }}
    >
      {/* Decorative Angelic Corner Halos */}
      <div className="posterCornerDeco topLeft">✧ ♡ ✦</div>
      <div className="posterCornerDeco topRight">✦ ♡ ✧</div>

      {/* Watermark Overlay */}
      {watermark.enabled && watermark.text && (
        <div
          className={`posterWatermarkOverlay wm-${watermark.style}`}
          style={{ opacity: (watermark.opacity || 18) / 100 }}
        >
          {watermark.style === 'tiled' && (
            <div className="wmTiledGrid">
              {tiledItems.map((n) => (
                <span key={n} className="wmTiledItem">
                  ✧ {watermark.text}{' '}
                  {watermark.subtext ? `· ${watermark.subtext}` : ''} ✧
                </span>
              ))}
            </div>
          )}
          {watermark.style === 'center' && (
            <div className="wmCenterStamp">
              {watermark.logo && (
                <img
                  src={watermark.logo}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                />
              )}
              <b>{watermark.text}</b>
              {watermark.subtext && <small>{watermark.subtext}</small>}
            </div>
          )}
          {watermark.style === 'corner' && (
            <div className="wmCornerBadge">
              {watermark.logo && (
                <img
                  src={watermark.logo}
                  alt="Logo"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <b>{watermark.text}</b>
                {watermark.subtext && <small>{watermark.subtext}</small>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Poster Header */}
      <header className="posterHeader">
        <div className="posterHeaderLeft">
          {watermark.logo ? (
            <img
              src={watermark.logo}
              alt="Shop Logo"
              className="posterShopLogo"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="posterCrest">✧</div>
          )}
          <div>
            <span className="posterEyebrow">
              {posterMode === 'selling'
                ? 'ROV ACCOUNT SHOWCASE & SELLING POSTER'
                : posterMode === 'showcase'
                  ? 'ROV RARE SKIN SPOTLIGHT'
                  : 'ROV SKIN COLLECTION GALLERY'}
            </span>
            <h3 className="posterTitle">
              {accountInfo.title || 'RoV Angelic Skin Collection'}
            </h3>
            {accountInfo.subtitle && (
              <p className="posterSubtitle">{accountInfo.subtitle}</p>
            )}
          </div>
        </div>

        {posterMode === 'selling' && (
          <div className="posterPriceBox">
            <small>PRICE / ราคาเพียง</small>
            <b>
              {accountInfo.price
                ? `${accountInfo.price} ฿`
                : 'ทักแชทสอบถาม'}
            </b>
            {accountInfo.accountCode && (
              <span className="posterCodeTag">
                ID: {accountInfo.accountCode}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Account Stats Ribbon (Shown in Selling Mode or if toggled) */}
      {posterMode === 'selling' && (
        <div className="posterStatsRibbon">
          <div className="statCell">
            <small>RANK / แรงค์</small>
            <b>{accountInfo.rank || 'Conqueror'}</b>
          </div>
          <div className="statCell">
            <small>HEROES / ฮีโร่</small>
            <b className="tabular">{accountInfo.heroCount || '115'} ตัว</b>
          </div>
          <div className="statCell">
            <small>SKINS / สกินรวม</small>
            <b className="tabular">
              {accountInfo.skinCount || selectedSkins.length} สกิน
            </b>
          </div>
          <div className="statCell">
            <small>WIN RATE / วินเรท</small>
            <b className="tabular">{accountInfo.winRate || '62.5%'}</b>
          </div>
          <div className="statCell">
            <small>RUNE / รูน</small>
            <b>{accountInfo.runeLevel || 'รูน Lv.3 ครบ 30 หน้า'}</b>
          </div>
          <div className="statCell">
            <small>STATUS / ข้อมูลผูกไอดี</small>
            <b>{accountInfo.bindStatus || 'Garena ล้วน (สะอาด)'}</b>
          </div>
        </div>
      )}

      {/* Main Skin Grid */}
      <div
        className={`posterSkinGrid shape-${layout.cardShape || 'portrait'}`}
        style={{
          gridTemplateColumns: `repeat(${layout.columns || 5}, minmax(0, 1fr))`,
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
              className="posterSkinCard"
            >
              <div
                className="posterSkinArt"
                style={{ background: fallbackBg }}
              >
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt={`${item.heroName} - ${item.name}`}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="posterFallbackArt">
                    <span className="fallbackInitial">
                      {item.heroName.slice(0, 1)}
                    </span>
                    <small>{item.heroName}</small>
                  </div>
                )}

                {/* Order Number Badge */}
                {layout.showOrderNumber && (
                  <span className="posterOrderNum tabular">#{idx + 1}</span>
                )}

                {/* Skin Tier Ribbon Badge */}
                {layout.showTierBadge && (
                  <span
                    className="posterTierBadge"
                    style={{ background: tierMeta.gradient }}
                  >
                    {tierMeta.gem} {tierMeta.shortLabel}
                  </span>
                )}

                {/* Bottom Scrim & Caption */}
                <div className="posterCardCaption">
                  <b>{item.name}</b>
                  {layout.showHeroName && <small>{item.heroName}</small>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Poster Footer: Contact, Note & Shop Credit */}
      <footer className="posterFooter">
        <div className="posterFooterLeft">
          {posterMode === 'selling' && accountInfo.contact && (
            <div className="posterContactPill">
              <span>ช่องทางติดต่อสั่งซื้อ:</span>
              <b>{accountInfo.contact}</b>
            </div>
          )}
          {accountInfo.note && (
            <p className="posterNoteText">หมายเหตุ: {accountInfo.note}</p>
          )}
        </div>

        <div className="posterFooterRight">
          <span>
            {watermark.text
              ? `✧ ${watermark.text} ✧`
              : '✧ ROV SKIN & ACCOUNT GENERATOR · WHITE ANGEL ✧'}
          </span>
        </div>
      </footer>
    </div>
  );
}
