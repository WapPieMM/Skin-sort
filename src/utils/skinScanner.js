/**
 * RoV 5x3 (15 cards) & 5x2 (10 cards) Screenshot Skin Detector & Badge-Resistant Matcher
 *
 * Designed specifically for RoV Hero/Skin list screenshots (like IMG_0442) where:
 * - Cards are arranged in 5 columns x 3 rows (15 cards, where Row 3 may be partially cut off at the bottom)
 *   or 5 columns x 2 rows (10 cards).
 * - Catalog skin images often have collaboration/tier badges in the top-right corner
 *   (e.g. "Attack on Titan", "Jujutsu Kaisen", "Limited", "Mythical") and skin name text at the bottom,
 *   while in-game cards have hero names and mastery points at the bottom.
 * - Our matcher masks out the top-right badge zone and bottom text/mastery zone, comparing the
 *   unoccluded Core Character Artwork Zone (y: 20%..63% of portrait height) with multi-offset alignment
 *   and outlier-trimmed pixel correlation.
 */

const PORTRAIT_ASPECT = 427 / 317; // Exact ratio of RoV portrait artwork height to card width (~1.347)
const DESC_W = 36;
const DESC_H = 48;

/**
 * Loads an image URL or Data URL into an HTMLImageElement.
 */
export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Empty image source'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Automatically detects the 5 column spans and 2 or 3 row spans of RoV cards in a screenshot.
 * Supports iPad (4:3, 2360x1640), cropped screenshots (2360x1250), and mobile widescreen (16:9 / 19.5:9 / 20:9).
 *
 * @param {HTMLImageElement} img
 * @param {'auto' | '5x3' | '5x2'} gridMode
 * @returns {Array<{ index: number, row: number, col: number, x: number, y: number, width: number, height: number, portraitHeight: number }>}
 */
export function detectRoVCardBoxes(img, gridMode = 'auto') {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  // Draw to a working analysis canvas (max width 1180 for fast pixel scanning)
  const scale = Math.min(1, 1180 / Math.max(1, W));
  const sw = Math.max(100, Math.round(W * scale));
  const sh = Math.max(100, Math.round(H * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  const getRGB = (x, y) => {
    const cx = Math.max(0, Math.min(sw - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(sh - 1, Math.round(y)));
    const i = (cy * sw + cx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Sample background color in the gap between left menu and card grid (~x = 21.8% of width, y = 25% of height)
  const bgSample = getRGB(sw * 0.218, sh * 0.25);

  // 1. Scan horizontal profile in the upper-middle band (y = 16% .. 34% of height) for x > 18% of width
  const yBandStart = Math.round(sh * 0.16);
  const yBandEnd = Math.round(sh * 0.34);
  const xStartSearch = Math.round(sw * 0.18);

  const xDiff = new Float32Array(sw);
  for (let x = xStartSearch; x < sw; x++) {
    let sum = 0;
    let count = 0;
    for (let y = yBandStart; y < yBandEnd; y += 2) {
      const [r, g, b] = getRGB(x, y);
      sum +=
        Math.abs(r - bgSample[0]) +
        Math.abs(g - bgSample[1]) +
        Math.abs(b - bgSample[2]);
      count++;
    }
    xDiff[x] = count > 0 ? sum / count : 0;
  }

  const findSegments = (profile, startIdx, endIdx, threshold, minLen) => {
    const segs = [];
    let inSeg = false;
    let segStart = 0;
    for (let i = startIdx; i < endIdx; i++) {
      if (profile[i] > threshold && !inSeg) {
        segStart = i;
        inSeg = true;
      } else if (profile[i] <= threshold && inSeg) {
        if (i - segStart >= minLen) {
          segs.push([segStart, i - 1]);
        }
        inSeg = false;
      }
    }
    if (inSeg && endIdx - segStart >= minLen) {
      segs.push([segStart, endIdx - 1]);
    }
    return segs;
  };

  let colSegs = null;
  for (const thresh of [46, 40, 52, 35, 60]) {
    const candidate = findSegments(
      xDiff,
      xStartSearch,
      sw,
      thresh,
      Math.round(sw * 0.08)
    );
    if (candidate.length === 5) {
      const widths = candidate.map(([a, b]) => b - a + 1);
      const avgW = widths.reduce((a, b) => a + b, 0) / 5;
      const maxDev = Math.max(...widths.map((w) => Math.abs(w - avgW) / avgW));
      if (maxDev < 0.12) {
        colSegs = candidate;
        break;
      }
    }
  }

  // Fallback column coordinates based on standard RoV 5-column layout (calibrated from IMG_0442: 2360px width)
  if (!colSegs) {
    const colFractions = [
      [540 / 2360, 856 / 2360],
      [898 / 2360, 1214 / 2360],
      [1255 / 2360, 1572 / 2360],
      [1613 / 2360, 1930 / 2360],
      [1971 / 2360, 2287 / 2360],
    ];
    colSegs = colFractions.map(([f0, f1]) => [
      Math.round(f0 * sw),
      Math.round(f1 * sw),
    ]);
  }

  const avgCardW =
    colSegs.reduce((acc, [a, b]) => acc + (b - a + 1), 0) / colSegs.length;

  // 2. Scan vertical profile across the 5 detected columns to locate Row 1, Row 2, and Row 3
  const yDiff = new Float32Array(sh);
  const yStartSearch = Math.round(sh * 0.07);
  for (let y = yStartSearch; y < sh; y++) {
    let sum = 0;
    let count = 0;
    for (const [x0, x1] of colSegs) {
      const pad = Math.round((x1 - x0) * 0.08);
      for (let x = x0 + pad; x <= x1 - pad; x += 4) {
        const [r, g, b] = getRGB(x, y);
        sum +=
          Math.abs(r - bgSample[0]) +
          Math.abs(g - bgSample[1]) +
          Math.abs(b - bgSample[2]);
        count++;
      }
    }
    yDiff[y] = count > 0 ? sum / count : 0;
  }

  let rowSegs = null;
  for (const thresh of [58, 52, 65, 45, 72]) {
    const candidate = findSegments(
      yDiff,
      yStartSearch,
      sh,
      thresh,
      Math.round(avgCardW * 0.65)
    );
    if (candidate.length >= 2 && candidate.length <= 3) {
      rowSegs = candidate;
      break;
    }
  }

  // Determine exact full card height (~1.577 * cardWidth in RoV, i.e., 500px when cardWidth is 317px)
  const expectedFullCardH = avgCardW * (500 / 317);
  const expectedRowGap = avgCardW * (50 / 317);

  if (!rowSegs || rowSegs.length < 2) {
    // Calibrated fallback from IMG_0442: Row 1 starts at y = 168/2360 * W
    const r1Top = Math.round(sw * (168 / 2360));
    const r1Bot = Math.min(sh - 1, Math.round(r1Top + expectedFullCardH));
    const r2Top = Math.round(r1Bot + expectedRowGap);
    const r2Bot = Math.min(sh - 1, Math.round(r2Top + expectedFullCardH));
    rowSegs = [
      [r1Top, r1Bot],
      [r2Top, r2Bot],
    ];
    const r3Top = Math.round(r2Bot + expectedRowGap);
    if (sh - r3Top >= avgCardW * 0.7) {
      rowSegs.push([r3Top, sh - 1]);
    }
  } else {
    // Refine row heights in case the thin dark gap above the blue mastery bar split or extended a segment
    const r1Top = rowSegs[0][0];
    const r1Bot = Math.min(sh - 1, Math.round(r1Top + expectedFullCardH));
    const r2Top =
      rowSegs[1]?.[0] ?? Math.round(r1Bot + expectedRowGap);
    const r2Bot = Math.min(sh - 1, Math.round(r2Top + expectedFullCardH));
    const refined = [
      [r1Top, r1Bot],
      [r2Top, r2Bot],
    ];
    const r3Top =
      rowSegs[2]?.[0] ?? Math.round(r2Bot + expectedRowGap);
    if (sh - r3Top >= avgCardW * 0.65) {
      refined.push([r3Top, sh - 1]);
    }
    rowSegs = refined;
  }

  // Apply explicit gridMode override if requested by user ('5x3' vs '5x2')
  if (gridMode === '5x2' && rowSegs.length > 2) {
    rowSegs = rowSegs.slice(0, 2);
  } else if (gridMode === '5x3' && rowSegs.length === 2) {
    const r2Bot = rowSegs[1][1];
    const r3Top = Math.round(r2Bot + expectedRowGap);
    if (r3Top < sh - 20) {
      rowSegs.push([r3Top, sh - 1]);
    }
  }

  // Convert back to original image pixel coordinates
  const boxes = [];
  let idx = 0;
  for (let r = 0; r < rowSegs.length; r++) {
    const [sy0, sy1] = rowSegs[r];
    for (let c = 0; c < colSegs.length; c++) {
      const [sx0, sx1] = colSegs[c];
      const x = Math.round(sx0 / scale);
      const y = Math.round(sy0 / scale);
      const width = Math.round((sx1 - sx0 + 1) / scale);
      const visibleHeight = Math.min(
        H - y,
        Math.round((sy1 - sy0 + 1) / scale)
      );
      // True portrait artwork height (equivalent to 306x427 catalog card) derived from card width
      const portraitHeight = Math.round(width * PORTRAIT_ASPECT);

      boxes.push({
        index: idx++,
        row: r,
        col: c,
        x,
        y,
        width,
        height: visibleHeight,
        portraitHeight,
      });
    }
  }

  return boxes;
}

/**
 * Extracts a normalized 36x48 RGB & Gradient descriptor for a catalog skin image,
 * or for a screenshot card box with a given (dxFrac, dyFrac, scaleFactor) alignment offset.
 */
function extractNormalizedPatch(
  ctx,
  img,
  srcX,
  srcY,
  srcW,
  srcPortH,
  maxVisibleH
) {
  ctx.clearRect(0, 0, DESC_W, DESC_H);
  // How much of the portrait height is actually visible in the source image (handles partial Row 3!)
  const visibleRatio = Math.max(
    0.5,
    Math.min(1, maxVisibleH / Math.max(1, srcPortH))
  );
  const drawSrcH = srcPortH * visibleRatio;
  const drawDstH = Math.round(DESC_H * visibleRatio);

  ctx.drawImage(
    img,
    srcX,
    srcY,
    srcW,
    drawSrcH,
    0,
    0,
    DESC_W,
    drawDstH
  );

  const { data } = ctx.getImageData(0, 0, DESC_W, DESC_H);
  return {
    data: new Uint8Array(data),
    visibleRows: drawDstH,
  };
}

/**
 * Computes an occlusion-resistant similarity score (0..100) between a screenshot card patch
 * and a catalog skin patch.
 *
 * Key properties:
 * 1. Masks out Top-Right Badge Zone (y: 0..26%, x: 38..100%) where collab/tier badges ("Attack on Titan",
 *    "Jujutsu Kaisen", "Limited", "Mythical") appear in catalog cards.
 * 2. Masks out Bottom Text/Mastery Zone (y: 64..100%) where skin names or hero mastery bars appear.
 * 3. Uses Outlier-Trimmed Pixel Distance (drops the worst 22% of pixels in the core zone) so even
 *    oversized badges, buff arrows, or lane icons don't hurt the match score.
 * 4. Combines RGB color closeness + local gradient (edge) correlation.
 */
function computeBadgeMaskedSimilarity(cardPatch, catPatch) {
  const maxRow = Math.min(
    Math.floor(DESC_H * 0.64),
    cardPatch.visibleRows - 2,
    catPatch.visibleRows - 2
  );
  const minRow = Math.floor(DESC_H * 0.08);
  const minCol = Math.floor(DESC_W * 0.08);
  const maxCol = Math.floor(DESC_W * 0.92);

  if (maxRow <= minRow + 4) return 0;

  const pixelErrors = [];
  let gradDot = 0;
  let gradMagCard = 0;
  let gradMagCat = 0;

  const cData = cardPatch.data;
  const kData = catPatch.data;

  for (let y = minRow; y < maxRow; y++) {
    const gy = y / DESC_H;
    for (let x = minCol; x < maxCol; x++) {
      const gx = x / DESC_W;

      // MASK 1: Top-Right Badge Zone (Collab logos like Attack on Titan / Jujutsu Kaisen / Tier badges)
      if (gy < 0.27 && gx > 0.36) continue;
      // MASK 2: Top-Left / Top-Center edge where some wide logos or lane icons sit
      if (gy < 0.16 && gx > 0.25) continue;

      const idx = (y * DESC_W + x) * 4;
      const r1 = cData[idx];
      const g1 = cData[idx + 1];
      const b1 = cData[idx + 2];

      const r2 = kData[idx];
      const g2 = kData[idx + 1];
      const b2 = kData[idx + 2];

      const diff =
        (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)) / 3;
      pixelErrors.push(diff);

      // Compute luminance gradient for structural edge matching
      const idxRight = idx + 4;
      const idxDown = idx + DESC_W * 4;

      const lum1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
      const lum1R =
        0.299 * cData[idxRight] +
        0.587 * cData[idxRight + 1] +
        0.114 * cData[idxRight + 2];
      const lum1D =
        0.299 * cData[idxDown] +
        0.587 * cData[idxDown + 1] +
        0.114 * cData[idxDown + 2];

      const lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
      const lum2R =
        0.299 * kData[idxRight] +
        0.587 * kData[idxRight + 1] +
        0.114 * kData[idxRight + 2];
      const lum2D =
        0.299 * kData[idxDown] +
        0.587 * kData[idxDown + 1] +
        0.114 * kData[idxDown + 2];

      const gx1 = lum1R - lum1;
      const gy1 = lum1D - lum1;
      const gx2 = lum2R - lum2;
      const gy2 = lum2D - lum2;

      gradDot += gx1 * gx2 + gy1 * gy2;
      gradMagCard += gx1 * gx1 + gy1 * gy1;
      gradMagCat += gx2 * gx2 + gy2 * gy2;
    }
  }

  if (!pixelErrors.length) return 0;

  // Sort pixel errors and trim the highest 22% (outlier rejection for any overhanging badge/icon)
  pixelErrors.sort((a, b) => a - b);
  const keepCount = Math.max(1, Math.floor(pixelErrors.length * 0.78));
  let trimmedSum = 0;
  for (let i = 0; i < keepCount; i++) {
    trimmedSum += pixelErrors[i];
  }
  const trimmedMeanDiff = trimmedSum / keepCount; // 0..255 (lower is better; same skin is typically 4..18, different skin is 42..95)

  // Convert trimmedMeanDiff to a 0..100 color similarity score
  const colorScore = Math.max(0, Math.min(100, 100 - trimmedMeanDiff * 1.35));

  // Structural gradient cosine similarity (-1..1 -> 0..100)
  const denom = Math.sqrt(gradMagCard * gradMagCat);
  const gradCosine = denom > 1e-3 ? gradDot / denom : 0;
  const edgeScore = Math.max(0, Math.min(100, (gradCosine + 0.1) * 90));

  return colorScore * 0.72 + edgeScore * 0.28;
}

/**
 * Precomputes normalized patches for all skins in the website catalog.
 */
export async function buildCatalogSkinIndex(heroes, onProgress) {
  const workCanvas = document.createElement('canvas');
  workCanvas.width = DESC_W;
  workCanvas.height = DESC_H;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });

  const allEntries = [];
  for (const hero of heroes || []) {
    for (const skin of hero.skins || []) {
      const imgSrc = skin.image || hero.image || '';
      if (imgSrc) {
        allEntries.push({
          heroId: hero.id,
          heroName: hero.name,
          skinId: skin.id,
          skinName: skin.name,
          image: imgSrc,
        });
      }
    }
  }

  const indexed = [];
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    try {
      const img = await loadImageElement(entry.image);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        const patch = extractNormalizedPatch(ctx, img, 0, 0, w, h, h);
        indexed.push({
          ...entry,
          patch,
        });
      }
    } catch {
      // Skip broken catalog image
    }
    if (onProgress && i % 10 === 0) {
      onProgress(Math.round(((i + 1) / Math.max(1, allEntries.length)) * 100));
    }
  }

  return indexed;
}

/**
 * Scans a single RoV screenshot (5x3 or 5x2) and matches each card slot against the catalog index.
 */
export async function scanScreenshotForSkins({
  file,
  catalogIndex,
  gridMode = 'auto',
  matchThreshold = 66,
}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    reader.readAsDataURL(file);
  });

  const img = await loadImageElement(dataUrl);
  const boxes = detectRoVCardBoxes(img, gridMode);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = DESC_W;
  workCanvas.height = DESC_H;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

  // Canvas for generating crisp preview thumbnails of each cropped card from the screenshot
  const thumbCanvas = document.createElement('canvas');
  const thumbW = 132;
  const thumbH = 184;
  thumbCanvas.width = thumbW;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d');

  // Alignment micro-offsets to test (compensates for slight border/zoom differences between game & catalog)
  const offsets = [
    { dx: 0, dy: 0.018, scale: 1.0 },
    { dx: 0, dy: 0, scale: 1.0 },
    { dx: 0, dy: 0.035, scale: 0.98 },
    { dx: -0.015, dy: 0.018, scale: 0.98 },
    { dx: 0.015, dy: 0.018, scale: 0.98 },
    { dx: 0, dy: 0.018, scale: 0.95 },
  ];

  const slots = boxes.map((box) => {
    // Create thumbnail of the detected card slot
    thumbCtx.fillStyle = '#191838';
    thumbCtx.fillRect(0, 0, thumbW, thumbH);
    const visRatio = Math.min(1, box.height / Math.max(1, box.portraitHeight));
    thumbCtx.drawImage(
      img,
      box.x,
      box.y,
      box.width,
      Math.min(box.height, box.portraitHeight),
      0,
      0,
      thumbW,
      Math.round(thumbH * visRatio)
    );
    const cropThumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);

    // Extract patches across alignment offsets for this card
    const cardPatches = offsets.map((off) => {
      const sx = box.x + box.width * off.dx + (box.width * (1 - off.scale)) / 2;
      const sy = box.y + box.portraitHeight * off.dy;
      const sw = box.width * off.scale;
      const sh = box.portraitHeight * off.scale;
      const maxVisH = Math.max(10, box.y + box.height - sy);
      return extractNormalizedPatch(workCtx, img, sx, sy, sw, sh, maxVisH);
    });

    // Score every catalog skin against this card
    const scored = catalogIndex.map((catItem) => {
      let bestScore = 0;
      for (let k = 0; k < cardPatches.length; k++) {
        const s = computeBadgeMaskedSimilarity(cardPatches[k], catItem.patch);
        if (s > bestScore) bestScore = s;
      }
      return {
        heroId: catItem.heroId,
        heroName: catItem.heroName,
        skinId: catItem.skinId,
        skinName: catItem.skinName,
        image: catItem.image,
        score: Math.round(bestScore),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const topCandidates = scored.slice(0, 4);
    const topMatch = topCandidates[0] || null;
    const isMatched = Boolean(topMatch && topMatch.score >= matchThreshold);

    return {
      slotId: `slot_${box.index}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      slotNumber: box.index + 1,
      row: box.row + 1,
      col: box.col + 1,
      isPartialRow: box.height < box.portraitHeight * 0.9,
      cropThumbUrl,
      // Auto-skip if no catalog skin meets the confidence threshold
      included: isMatched,
      selectedMatch: isMatched ? topMatch : null,
      candidates: topCandidates,
    };
  });

  return {
    fileName: file.name,
    screenshotUrl: dataUrl,
    detectedRows: boxes.length > 10 ? 3 : 2,
    totalSlots: boxes.length,
    slots,
  };
}
