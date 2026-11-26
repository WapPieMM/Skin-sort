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

import {
  loadScannerPatchCacheFromIndexedDB,
  saveScannerPatchCacheToIndexedDB,
} from './catalogStorage';

const PORTRAIT_ASPECT = 427 / 317; // Exact ratio of RoV portrait artwork height to card width (~1.347)
const DESC_W = 36;
const DESC_H = 48;

// In-memory cache of imageUrl -> { data: Uint8Array, visibleRows: number }
let memoryPatchCache = null;
let ongoingWarmupPromise = null;

/**
 * Loads an image URL or Data URL into an HTMLImageElement with timeout protection.
 */
export function loadImageElement(src, timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('Empty image source'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Image load timeout'));
    }, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load image'));
    };
    img.src = src;
  });
}

/**
 * Detects a seamless (zero-gap, edge-to-edge) skin collage grid of ANY (cols x rows),
 * such as 15x5 (75 skins like image_b3de0356.png), 10x2 (20 skins like IMG_0432.png), 12x4, etc.
 *
 * Uses 1px + 2px cross-seam RGB discontinuity energy at candidate grid divisions combined with
 * RoV portrait card aspect ratio constraints (tileH / tileW in 1.12 .. 1.92) and quantile peak
 * consistency so sub-harmonics (e.g. 5 instead of 15) and multiples (e.g. 10 instead of 5) are rejected.
 */
function detectSeamlessCollageGrid(data, sw, sh, W, H, customGrid = null) {
  const getRGB = (x, y) => {
    const cx = Math.max(0, Math.min(sw - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(sh - 1, Math.round(y)));
    const i = (cy * sw + cx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const buildBoxesForGrid = (cols, rows, confidence = 100) => {
    const boxes = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const y0 = Math.round((r * H) / rows);
      const y1 = Math.round(((r + 1) * H) / rows);
      const cellH = Math.max(1, y1 - y0);

      for (let c = 0; c < cols; c++) {
        const x0 = Math.round((c * W) / cols);
        const x1 = Math.round(((c + 1) * W) / cols);
        const cellW = Math.max(1, x1 - x0);

        // Check if this cell (especially trailing cells on the last row) is blank/uniform background
        if (r === rows - 1 && cols * rows > 1) {
          const sx0 = Math.round((c * sw) / cols);
          const sx1 = Math.round(((c + 1) * sw) / cols);
          const sy0 = Math.round((r * sh) / rows);
          const sy1 = Math.round(((r + 1) * sh) / rows);
          const padX = Math.max(2, Math.round((sx1 - sx0) * 0.15));
          const padY = Math.max(2, Math.round((sy1 - sy0) * 0.15));
          let sumL = 0;
          let sumL2 = 0;
          let cnt = 0;
          for (let py = sy0 + padY; py < sy1 - padY; py += 3) {
            for (let px = sx0 + padX; px < sx1 - padX; px += 3) {
              const [rr, gg, bb] = getRGB(px, py);
              const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
              sumL += lum;
              sumL2 += lum * lum;
              cnt++;
            }
          }
          if (cnt > 4) {
            const mean = sumL / cnt;
            const stdDev = Math.sqrt(Math.max(0, sumL2 / cnt - mean * mean));
            if (stdDev < 7.5) {
              continue; // Skip blank trailing cell
            }
          }
        }

        boxes.push({
          index: idx++,
          row: r,
          col: c,
          x: x0,
          y: y0,
          width: cellW,
          height: cellH,
          portraitHeight: cellH,
          detectedCols: cols,
          detectedRows: rows,
          layoutType: 'collage',
        });
      }
    }
    return {
      cols,
      rows,
      confidence,
      boxes,
    };
  };

  // If user manually specified custom cols & rows, build directly
  const manualCols = Number(customGrid?.cols) || 0;
  const manualRows = Number(customGrid?.rows) || 0;
  if (manualCols >= 1 && manualCols <= 25 && manualRows >= 1 && manualRows <= 20) {
    return buildBoxesForGrid(manualCols, manualRows, 100);
  }

  // Compute 1px + 2px vertical & horizontal seam discontinuity profiles
  const vSeam = new Float32Array(sw);
  for (let x = 1; x < sw - 1; x++) {
    let sum = 0;
    let cnt = 0;
    for (let y = 0; y < sh; y += 2) {
      const iPrev = (y * sw + (x - 1)) * 4;
      const iCur = (y * sw + x) * 4;
      const iNext = (y * sw + (x + 1)) * 4;
      const d1 =
        Math.abs(data[iCur] - data[iPrev]) +
        Math.abs(data[iCur + 1] - data[iPrev + 1]) +
        Math.abs(data[iCur + 2] - data[iPrev + 2]);
      const d2 =
        (Math.abs(data[iNext] - data[iPrev]) +
          Math.abs(data[iNext + 1] - data[iPrev + 1]) +
          Math.abs(data[iNext + 2] - data[iPrev + 2])) *
        0.82;
      sum += d1 > d2 ? d1 : d2;
      cnt++;
    }
    vSeam[x] = cnt > 0 ? sum / cnt : 0;
  }

  const hSeam = new Float32Array(sh);
  for (let y = 1; y < sh - 1; y++) {
    let sum = 0;
    let cnt = 0;
    for (let x = 0; x < sw; x += 2) {
      const iPrev = ((y - 1) * sw + x) * 4;
      const iCur = (y * sw + x) * 4;
      const iNext = ((y + 1) * sw + x) * 4;
      const d1 =
        Math.abs(data[iCur] - data[iPrev]) +
        Math.abs(data[iCur + 1] - data[iPrev + 1]) +
        Math.abs(data[iCur + 2] - data[iPrev + 2]);
      const d2 =
        (Math.abs(data[iNext] - data[iPrev]) +
          Math.abs(data[iNext + 1] - data[iPrev + 1]) +
          Math.abs(data[iNext + 2] - data[iPrev + 2])) *
        0.82;
      sum += d1 > d2 ? d1 : d2;
      cnt++;
    }
    hSeam[y] = cnt > 0 ? sum / cnt : 0;
  }

  const scoreDivisions = (seamArr, len, minDiv, maxDiv) => {
    const out = new Map();
    for (let div = minDiv; div <= maxDiv; div++) {
      if (div === 1) {
        out.set(1, { mean: 18, q25: 18, strongRatio: 1 });
        continue;
      }
      const excesses = [];
      for (let k = 1; k < div; k++) {
        const pos = Math.round((k * len) / div);
        let best = 0;
        for (let d = -2; d <= 2; d++) {
          const p = Math.max(1, Math.min(len - 2, pos + d));
          if (seamArr[p] > best) best = seamArr[p];
        }
        let bg = 0;
        let bgc = 0;
        for (const d of [-7, -6, -5, -4, 4, 5, 6, 7]) {
          const p = Math.max(1, Math.min(len - 2, pos + d));
          bg += seamArr[p];
          bgc++;
        }
        excesses.push(Math.max(0, best - (bgc > 0 ? bg / bgc : 0)));
      }
      excesses.sort((a, b) => a - b);
      const mean =
        excesses.reduce((acc, v) => acc + v, 0) / Math.max(1, excesses.length);
      const q25 = excesses[Math.floor(excesses.length * 0.25)] || 0;
      const strongRatio =
        excesses.filter((v) => v >= 12).length / Math.max(1, excesses.length);
      out.set(div, { mean, q25, strongRatio });
    }
    return out;
  };

  const colStats = scoreDivisions(vSeam, sw, 2, 22);
  const rowStats = scoreDivisions(hSeam, sh, 1, 15);

  let best = null;
  for (let cols = 2; cols <= 22; cols++) {
    for (let rows = 1; rows <= 15; rows++) {
      // If user supplied only one dimension, lock that dimension
      if (manualCols > 0 && cols !== manualCols) continue;
      if (manualRows > 0 && rows !== manualRows) continue;

      const tileW = W / cols;
      const tileH = H / rows;
      const aspect = tileH / Math.max(1, tileW);
      // Every RoV / SortSkin seamless grid card has portrait aspect ~1.35..1.68 (allow 1.12..1.92)
      if (aspect < 1.12 || aspect > 1.92) continue;

      const cs = colStats.get(cols);
      const rs = rowStats.get(rows);
      if (!cs || !rs) continue;

      const colScore = cs.q25 * 0.65 + cs.mean * 0.35;
      const rowScore =
        rows === 1 ? colScore * 0.55 : rs.q25 * 0.65 + rs.mean * 0.35;

      // Gentle preference around standard RoV skin portrait ratio (~1.46)
      const aspectBonus = 1 - Math.min(0.28, Math.abs(aspect - 1.46) * 0.38);
      const combined =
        (colScore + rowScore) *
        aspectBonus *
        (0.45 + 0.55 * cs.strongRatio) *
        (0.45 + 0.55 * rs.strongRatio);

      if (!best || combined > best.combined) {
        best = {
          cols,
          rows,
          colScore,
          rowScore,
          combined,
          aspect,
        };
      }
    }
  }

  if (!best) {
    // Fallback estimation from image aspect ratio assuming standard ~1.45 portrait card
    const fallbackCols = manualCols > 0 ? manualCols : Math.max(2, Math.min(20, Math.round((W / Math.max(1, H)) * 4.5)));
    const fallbackRows = manualRows > 0 ? manualRows : Math.max(1, Math.min(12, Math.round((H * fallbackCols) / Math.max(1, W * 1.45))));
    return buildBoxesForGrid(fallbackCols, fallbackRows, 0);
  }

  const result = buildBoxesForGrid(best.cols, best.rows, best.combined);
  result.colScore = best.colScore;
  result.rowScore = best.rowScore;
  return result;
}

/**
 * Automatically detects RoV card bounding boxes across ALL supported screenshot formats:
 * 1. Seamless Skin Collage Grid (ANY cols × rows, e.g. 15×5 = 75 cards like image_b3de0356.png, 10×2 = 20 cards like IMG_0432.png)
 * 2. RoV Shop -> Skins ("ร้านค้า -> สกิน", 5×2 = 10 cards with "มีแล้ว" button bar at bottom, like 7A31B370.jpeg)
 * 3. RoV Hero / Skin List ("รายชื่อฮีโร่", 5×3 = 15 cards with partial Row 3, or 5×2 = 10 cards, like IMG_0442)
 *
 * @param {HTMLImageElement} img
 * @param {'auto' | 'collage' | 'shop' | '5x3' | '5x2'} gridMode
 * @param {{ cols?: number, rows?: number } | null} customGrid
 * @returns {Array<{ index: number, row: number, col: number, x: number, y: number, width: number, height: number, portraitHeight: number, detectedCols: number, detectedRows: number, layoutType: 'collage' | 'shop' | 'herolist' }>}
 */
export function detectRoVCardBoxes(img, gridMode = 'auto', customGrid = null) {
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  // Draw to a working analysis canvas (max width 1440 keeps 15–20 col seams sharp while remaining fast)
  const scale = Math.min(1, 1440 / Math.max(1, W));
  const sw = Math.max(100, Math.round(W * scale));
  const sh = Math.max(100, Math.round(H * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // Explicit Seamless Collage mode
  if (gridMode === 'collage') {
    const collage = detectSeamlessCollageGrid(data, sw, sh, W, H, customGrid);
    return collage.boxes;
  }

  const getRGB = (x, y) => {
    const cx = Math.max(0, Math.min(sw - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(sh - 1, Math.round(y)));
    const i = (cy * sw + cx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Measure whether the rightmost strip (x = 98.8%) is a uniform in-game background margin
  // (In-game RoV UI has a smooth dark blue margin; seamless collages have busy skin artwork all the way to the edge)
  let marginJumpSum = 0;
  let marginJumpCnt = 0;
  const marginX = Math.round(sw * 0.988);
  for (let y = Math.round(sh * 0.15); y < Math.round(sh * 0.85); y += 4) {
    const [r1, g1, b1] = getRGB(marginX, y);
    const [r2, g2, b2] = getRGB(marginX, y + 4);
    marginJumpSum +=
      Math.abs(r2 - r1) + Math.abs(g2 - g1) + Math.abs(b2 - b1);
    marginJumpCnt++;
  }
  const rightMarginBusyness =
    marginJumpCnt > 0 ? marginJumpSum / marginJumpCnt : 0;

  // 1. Scan horizontal profile in y = 22% .. 36% of height for x in 18.2% .. 98.5% of width,
  // comparing each pixel (x, y) against the clean right-margin background at the SAME y (x = 98.8% of width).
  const yBandStart = Math.round(sh * 0.22);
  const yBandEnd = Math.round(sh * 0.36);
  const xStartSearch = Math.round(sw * 0.182);
  const xEndSearch = Math.round(sw * 0.985);

  const xDiff = new Float32Array(sw);
  for (let x = xStartSearch; x < xEndSearch; x++) {
    let sum = 0;
    let count = 0;
    for (let y = yBandStart; y <= yBandEnd; y += 2) {
      const bg = getRGB(sw * 0.988, y);
      const [r, g, b] = getRGB(x, y);
      sum +=
        Math.abs(r - bg[0]) +
        Math.abs(g - bg[1]) +
        Math.abs(b - bg[2]);
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
  if (rightMarginBusyness < 26 || gridMode !== 'auto') {
    for (const thresh of [46, 40, 52, 35, 60, 68]) {
      const candidate = findSegments(
        xDiff,
        xStartSearch,
        xEndSearch,
        thresh,
        Math.round(sw * 0.08)
      );
      if (candidate.length === 5) {
        // Columns 2..5 are surrounded by clean gutters; use their median width & uniform grid stride
        // to regularize all 5 columns so left-menu glow or dark jacket edges never shift Column 1.
        const widths25 = candidate
          .slice(1)
          .map(([a, b]) => b - a + 1)
          .sort((a, b) => a - b);
        const medW = widths25[1];
        const maxDev25 = Math.max(
          ...widths25.map((w) => Math.abs(w - medW) / Math.max(1, medW))
        );
        if (maxDev25 < 0.09) {
          // Compute uniform stride from Columns 2..5 right edges (which are immune to left-menu glow)
          const stride = (candidate[4][1] - candidate[1][1]) / 3;
          const col4Right = candidate[4][1];
          colSegs = [0, 1, 2, 3, 4].map((c) => {
            const right = Math.round(col4Right - (4 - c) * stride);
            const left = Math.round(right - medW + 1);
            return [left, right];
          });
          break;
        }
      }
    }
  }

  // In Auto mode: if 5 in-game guttered columns were NOT found cleanly (or right edge is artwork, not dark UI margin),
  // check if this image is a Seamless Skin Collage Grid (like 15x5 image_b3de0356.png or 10x2 IMG_0432.png)!
  if (gridMode === 'auto' && !colSegs) {
    const collage = detectSeamlessCollageGrid(data, sw, sh, W, H, customGrid);
    const strongCollage =
      collage.boxes.length >= 2 &&
      collage.confidence >= 28 &&
      (collage.colScore || 0) >= 10 &&
      (collage.rows === 1 || (collage.rowScore || 0) >= 14);
    if (strongCollage || rightMarginBusyness >= 24) {
      return collage.boxes;
    }
  }

  // Fallback column coordinates if custom aspect ratio in-game screenshot
  if (!colSegs) {
    const colFractions =
      gridMode === 'shop'
        ? [
            [459 / 2360, 799 / 2360],
            [821 / 2360, 1160 / 2360],
            [1182 / 2360, 1522 / 2360],
            [1544 / 2360, 1883 / 2360],
            [1905 / 2360, 2245 / 2360],
          ]
        : [
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
  const col1StartRatio = colSegs[0][0] / sw;

  // 2. Scan vertical profile comparing the 5 columns against the 4 inter-column gutters at the SAME y
  const gutterXs = [];
  for (let i = 0; i < 4; i++) {
    gutterXs.push(Math.round((colSegs[i][1] + colSegs[i + 1][0]) / 2));
  }

  const yStartSearch = Math.round(sh * 0.07);
  const yRowDiff = new Float32Array(sh);
  for (let y = yStartSearch; y < sh; y++) {
    let gr = 0;
    let gg = 0;
    let gb = 0;
    for (const gx of gutterXs) {
      const [r, g, b] = getRGB(gx, y);
      gr += r;
      gg += g;
      gb += b;
    }
    gr /= 4;
    gg /= 4;
    gb /= 4;

    let sum = 0;
    let count = 0;
    for (const [x0, x1] of colSegs) {
      const pad = Math.round((x1 - x0) * 0.08);
      for (let x = x0 + pad; x <= x1 - pad; x += 4) {
        const [r, g, b] = getRGB(x, y);
        sum +=
          Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb);
        count++;
      }
    }
    yRowDiff[y] = count > 0 ? sum / count : 0;
  }

  // Locate exact top of Row 1 (first sustained card band where yRowDiff > 26 for at least 0.25 * avgCardW)
  let r1Top = Math.round(
    sw * (col1StartRatio < 0.212 ? 315 / 2360 : 168 / 2360)
  );
  const minSustainedH = Math.max(12, Math.round(avgCardW * 0.25));
  for (let y = yStartSearch; y < Math.round(sh * 0.36); y++) {
    let sustained = true;
    for (let dy = 0; dy < minSustainedH && y + dy < sh; dy++) {
      if (yRowDiff[y + dy] <= 26) {
        sustained = false;
        break;
      }
    }
    if (sustained) {
      r1Top = y;
      break;
    }
  }

  // Distinguish Shop Screen ("ร้านค้า -> สกิน") vs Hero/Skin List Screen ("รายชื่อฮีโร่")
  // In Shop screen: Col 1 starts around 19.45% of width (< 21.2%), and Row 1 starts around y = 315/2360 (~13.35% of width)
  const isShopScreen =
    gridMode === 'shop' ||
    (gridMode !== '5x3' && (col1StartRatio < 0.212 || r1Top / sw > 0.108));

  let rowSegs = [];
  if (isShopScreen) {
    // Shop screen ("ร้านค้า -> สกิน"):
    // Full card height (portrait + "มีแล้ว" bar) = 623 / 340.6 * cardWidth (~1.829 * cardWidth)
    // Row gap = 42.5 / 340.6 * cardWidth (~0.125 * cardWidth)
    const shopFullCardH = avgCardW * (623 / 340.6);
    const shopRowGap = avgCardW * (42.5 / 340.6);
    const r1Bot = Math.min(sh - 1, Math.round(r1Top + shopFullCardH));
    const r2Top = Math.round(r1Bot + shopRowGap);
    const r2Bot = Math.min(sh - 1, Math.round(r2Top + shopFullCardH));
    rowSegs = [
      [r1Top, r1Bot],
      [r2Top, r2Bot],
    ];
    const r3Top = Math.round(r2Bot + shopRowGap);
    if (sh - r3Top >= avgCardW * 0.65) {
      rowSegs.push([r3Top, sh - 1]);
    }
  } else {
    // Hero/Skin List screen ("รายชื่อฮีโร่"):
    // Full card height (portrait + mastery bar) = 500 / 317 * cardWidth (~1.577 * cardWidth)
    // Row gap = 50 / 317 * cardWidth (~0.158 * cardWidth)
    const expectedFullCardH = avgCardW * (500 / 317);
    const expectedRowGap = avgCardW * (50 / 317);
    const r1Bot = Math.min(sh - 1, Math.round(r1Top + expectedFullCardH));
    const r2Top = Math.round(r1Bot + expectedRowGap);
    const r2Bot = Math.min(sh - 1, Math.round(r2Top + expectedFullCardH));
    rowSegs = [
      [r1Top, r1Bot],
      [r2Top, r2Bot],
    ];
    const r3Top = Math.round(r2Bot + expectedRowGap);
    if (sh - r3Top >= avgCardW * 0.65) {
      rowSegs.push([r3Top, sh - 1]);
    }

    // Apply explicit gridMode override if requested by user ('5x3' vs '5x2')
    if (gridMode === '5x2' && rowSegs.length > 2) {
      rowSegs = rowSegs.slice(0, 2);
    } else if (gridMode === '5x3' && rowSegs.length === 2) {
      if (r3Top < sh - 20) {
        rowSegs.push([r3Top, sh - 1]);
      }
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
      // Base portrait artwork height (equivalent to 306x427 catalog card)
      const portraitHeight = Math.round(width * PORTRAIT_ASPECT);
      // In Shop screen, the portrait frame above "มีแล้ว" extends up to 537/340.6 * width
      const shopPortraitHeight = Math.round(width * (537 / 340.6));

      boxes.push({
        index: idx++,
        row: r,
        col: c,
        x,
        y,
        width,
        height: visibleHeight,
        portraitHeight,
        shopPortraitHeight,
        detectedCols: colSegs.length,
        detectedRows: rowSegs.length,
        layoutType: isShopScreen ? 'shop' : 'herolist',
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
 * Stage 1 ultra-fast coarse color similarity (stride-2, zero heap allocation).
 * Used to pre-filter large catalogs (500..2,000+ skins) down to top 45 candidates
 * before running the exact outlier-trimmed & gradient-correlated Stage 2 scorer.
 */
function fastCoarseSimilarity(cardPatch, catPatch) {
  const maxRow = Math.min(
    Math.floor(DESC_H * 0.64),
    cardPatch.visibleRows - 2,
    catPatch.visibleRows - 2
  );
  const minRow = Math.floor(DESC_H * 0.08);
  const minCol = Math.floor(DESC_W * 0.08);
  const maxCol = Math.floor(DESC_W * 0.92);
  if (maxRow <= minRow + 4) return 0;

  const cData = cardPatch.data;
  const kData = catPatch.data;
  let diffSum = 0;
  let cnt = 0;

  for (let y = minRow; y < maxRow; y += 2) {
    const gy = y / DESC_H;
    for (let x = minCol; x < maxCol; x += 2) {
      const gx = x / DESC_W;
      if (gy < 0.27 && gx > 0.36) continue;
      if (gy < 0.16 && gx > 0.25) continue;

      const idx = (y * DESC_W + x) * 4;
      diffSum +=
        Math.abs(cData[idx] - kData[idx]) +
        Math.abs(cData[idx + 1] - kData[idx + 1]) +
        Math.abs(cData[idx + 2] - kData[idx + 2]);
      cnt++;
    }
  }

  if (cnt === 0) return 0;
  return 255 - diffSum / (cnt * 3);
}

/**
 * Computes an occlusion-resistant similarity score (0..100) between a screenshot card patch
 * and a catalog skin patch.
 *
 * Key properties:
 * 1. Masks out Top-Right Badge Zone (y: 0..26%, x: 38..100%) where collab/tier badges ("Attack on Titan",
 *    "Jujutsu Kaisen", "Limited", "Mythical", "WaVe", "Divine", etc.) appear.
 * 2. Masks out Bottom Text/Icon/Mastery Zone (y: 64..100%) where recall/kill icons, skin names, or mastery bars appear.
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
 * - Uses persistent IndexedDB cache + in-memory cache so once indexed, subsequent page loads
 *   or modal opens are instant (< 0.05s) without re-downloading images from Cloud.
 * - Any uncached/new skins are fetched in parallel batches of 24 simultaneously.
 */
export async function buildCatalogSkinIndex(heroes, onProgress, forceRebuild = false) {
  if (!memoryPatchCache || forceRebuild) {
    if (forceRebuild) {
      memoryPatchCache = {};
    } else {
      const persisted = await loadScannerPatchCacheFromIndexedDB();
      memoryPatchCache = persisted && typeof persisted === 'object' ? persisted : {};
    }
  }

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

  if (allEntries.length === 0) {
    onProgress?.({ percent: 100, cachedCount: 0, totalCount: 0, uncachedCount: 0 });
    return [];
  }

  // Identify unique image URLs that are not yet in the cache
  const uncachedUrlsSet = new Set();
  for (const entry of allEntries) {
    const cached = memoryPatchCache[entry.image];
    if (!cached || !cached.data || !cached.visibleRows) {
      uncachedUrlsSet.add(entry.image);
    }
  }

  const uncachedUrls = Array.from(uncachedUrlsSet);
  const totalUniqueToFetch = uncachedUrls.length;
  const alreadyCachedCount = allEntries.length - totalUniqueToFetch;

  // If everything is already cached in IndexedDB, return immediately!
  if (totalUniqueToFetch === 0) {
    onProgress?.({
      percent: 100,
      cachedCount: allEntries.length,
      totalCount: allEntries.length,
      uncachedCount: 0,
    });
    return allEntries
      .map((entry) => {
        const cachedPatch = memoryPatchCache[entry.image];
        if (!cachedPatch) return null;
        return {
          ...entry,
          patch: {
            data:
              cachedPatch.data instanceof Uint8Array
                ? cachedPatch.data
                : new Uint8Array(cachedPatch.data),
            visibleRows: cachedPatch.visibleRows,
          },
        };
      })
      .filter(Boolean);
  }

  // Otherwise, process only the missing URLs in fast parallel batches of 24
  const workCanvas = document.createElement('canvas');
  workCanvas.width = DESC_W;
  workCanvas.height = DESC_H;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });

  const CONCURRENCY = 24;
  let completedNew = 0;
  let newlyAddedSinceSave = 0;

  onProgress?.({
    percent: Math.round((alreadyCachedCount / Math.max(1, allEntries.length)) * 100),
    cachedCount: alreadyCachedCount,
    totalCount: allEntries.length,
    uncachedCount: totalUniqueToFetch,
  });

  for (let start = 0; start < uncachedUrls.length; start += CONCURRENCY) {
    const batch = uncachedUrls.slice(start, start + CONCURRENCY);
    const loadedBatch = await Promise.all(
      batch.map(async (url) => {
        try {
          const img = await loadImageElement(url, 6500);
          return { url, img };
        } catch {
          return { url, img: null };
        }
      })
    );

    for (const { url, img } of loadedBatch) {
      completedNew++;
      if (img) {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w > 0 && h > 0) {
          const patch = extractNormalizedPatch(ctx, img, 0, 0, w, h, h);
          memoryPatchCache[url] = patch;
          newlyAddedSinceSave++;
        }
      }
    }

    const doneTotal = alreadyCachedCount + completedNew;
    onProgress?.({
      percent: Math.min(99, Math.round((doneTotal / Math.max(1, allEntries.length)) * 100)),
      cachedCount: doneTotal,
      totalCount: allEntries.length,
      uncachedCount: totalUniqueToFetch - completedNew,
    });

    // Save checkpoint to IndexedDB every 96 newly computed skins so progress is never lost
    if (newlyAddedSinceSave >= 96) {
      newlyAddedSinceSave = 0;
      await saveScannerPatchCacheToIndexedDB(memoryPatchCache);
    }
  }

  // Final save to IndexedDB
  if (newlyAddedSinceSave > 0) {
    await saveScannerPatchCacheToIndexedDB(memoryPatchCache);
  }

  onProgress?.({
    percent: 100,
    cachedCount: allEntries.length,
    totalCount: allEntries.length,
    uncachedCount: 0,
  });

  const indexed = [];
  for (const entry of allEntries) {
    const cachedPatch = memoryPatchCache[entry.image];
    if (cachedPatch && cachedPatch.data) {
      indexed.push({
        ...entry,
        patch: {
          data:
            cachedPatch.data instanceof Uint8Array
              ? cachedPatch.data
              : new Uint8Array(cachedPatch.data),
          visibleRows: cachedPatch.visibleRows,
        },
      });
    }
  }

  return indexed;
}

/**
 * Quietly warms up the catalog skin index in the background once the catalog is loaded.
 */
export function warmUpCatalogSkinIndexInBackground(heroes) {
  if (ongoingWarmupPromise) return ongoingWarmupPromise;
  ongoingWarmupPromise = buildCatalogSkinIndex(heroes)
    .catch(() => [])
    .finally(() => {
      ongoingWarmupPromise = null;
    });
  return ongoingWarmupPromise;
}

/**
 * Scans a single RoV image (In-Game 5x3 / 5x2 / Shop OR Seamless Collage Grid like 15x5, 10x2)
 * and matches each card slot against the catalog index using 2-stage coarse-to-fine matching.
 */
export async function scanScreenshotForSkins({
  file,
  catalogIndex,
  gridMode = 'auto',
  customGrid = null,
  matchThreshold = 64,
  onSlotProgress,
}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    reader.readAsDataURL(file);
  });

  const img = await loadImageElement(dataUrl);
  const boxes = detectRoVCardBoxes(img, gridMode, customGrid);

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

  // Alignment offsets for in-game screenshots (Hero List & Shop)
  const gameOffsets = [
    { dx: 0, dy: 0.018, scale: 1.0, aspectMul: 1.0 },
    { dx: 0, dy: 0, scale: 1.0, aspectMul: 1.0 },
    { dx: 0, dy: 0, scale: 1.0, aspectMul: 1.036 },
    { dx: 0, dy: 0.02, scale: 0.98, aspectMul: 1.036 },
    { dx: 0, dy: 0, scale: 1.0, aspectMul: 1.12 },
    { dx: 0, dy: 0, scale: 1.0, aspectMul: 1.169 },
    { dx: 0, dy: 0.02, scale: 0.92, aspectMul: 1.169 },
    { dx: 0, dy: 0.035, scale: 0.98, aspectMul: 1.0 },
  ];

  // Alignment offsets for Seamless Collage tiles (edge-inset to avoid neighbor bleed, covers 1:1 & cover-cropped tiles)
  const collageOffsets = [
    { insetX: 0.012, insetY: 0.01, dy: 0, scale: 1.0, aspectMul: 1.0 },
    { insetX: 0.02, insetY: 0.02, dy: 0, scale: 0.96, aspectMul: 1.0 },
    { insetX: 0.012, insetY: 0.01, dy: 0.025, scale: 0.97, aspectMul: 1.0 },
    { insetX: 0.012, insetY: 0.01, dy: -0.02, scale: 0.97, aspectMul: 1.0 },
    { insetX: 0.012, insetY: 0.01, dy: 0, scale: 1.0, aspectMul: 0.92 },
    { insetX: 0.012, insetY: 0.01, dy: 0, scale: 1.0, aspectMul: 1.08 },
    { insetX: 0.035, insetY: 0.015, dy: 0.01, scale: 0.93, aspectMul: 0.95 },
  ];

  const layoutType = boxes[0]?.layoutType || 'herolist';
  const isCollageLayout = layoutType === 'collage';
  const isShopLayout = layoutType === 'shop';
  const detectedCols = boxes[0]?.detectedCols || 5;
  const detectedRows =
    boxes[0]?.detectedRows || (boxes.length > 10 ? 3 : 2);

  const slots = [];
  const FINE_CANDIDATE_LIMIT = 45;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];

    // Create thumbnail of the detected card slot
    thumbCtx.fillStyle = '#191838';
    thumbCtx.fillRect(0, 0, thumbW, thumbH);
    const displayPortH =
      box.layoutType === 'collage'
        ? box.height
        : box.layoutType === 'shop'
          ? box.shopPortraitHeight || box.portraitHeight
          : box.portraitHeight;
    const visRatio = Math.min(1, box.height / Math.max(1, displayPortH));
    thumbCtx.drawImage(
      img,
      box.x,
      box.y,
      box.width,
      Math.min(box.height, displayPortH),
      0,
      0,
      thumbW,
      Math.round(thumbH * visRatio)
    );
    const cropThumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);

    // Extract patches across alignment offsets for this card
    const cardPatches = isCollageLayout
      ? collageOffsets.map((off) => {
          const padX = box.width * (off.insetX || 0);
          const padY = box.height * (off.insetY || 0);
          const innerW = Math.max(8, box.width - padX * 2);
          const innerH = Math.max(8, box.height - padY * 2);
          const sw = innerW * off.scale;
          const targetH = Math.min(innerH, innerH * off.scale * (off.aspectMul || 1.0));
          const sx = box.x + padX + (innerW - sw) / 2;
          const rawSy = box.y + padY + (innerH - targetH) / 2 + innerH * off.dy;
          const sy = Math.max(
            box.y + padY,
            Math.min(box.y + box.height - padY - targetH, rawSy)
          );
          return extractNormalizedPatch(workCtx, img, sx, sy, sw, targetH, targetH);
        })
      : gameOffsets.map((off) => {
          const targetPortH = box.portraitHeight * (off.aspectMul || 1.0);
          const sx =
            box.x + box.width * off.dx + (box.width * (1 - off.scale)) / 2;
          const sy = box.y + targetPortH * off.dy;
          const sw = box.width * off.scale;
          const sh = targetPortH * off.scale;
          const maxVisH = Math.max(10, box.y + box.height - sy);
          return extractNormalizedPatch(workCtx, img, sx, sy, sw, sh, maxVisH);
        });

    // Stage 1: Ultra-fast coarse pre-filter if catalog is large (> 60 skins)
    let candidatesToRefine = catalogIndex;
    if (catalogIndex.length > FINE_CANDIDATE_LIMIT + 15) {
      const coarseScored = new Array(catalogIndex.length);
      const p0 = cardPatches[0];
      const p1 = cardPatches[1] || p0;
      for (let c = 0; c < catalogIndex.length; c++) {
        const catPatch = catalogIndex[c].patch;
        const s0 = fastCoarseSimilarity(p0, catPatch);
        const s1 = p1 === p0 ? s0 : fastCoarseSimilarity(p1, catPatch);
        coarseScored[c] = { item: catalogIndex[c], coarse: s0 > s1 ? s0 : s1 };
      }
      coarseScored.sort((a, b) => b.coarse - a.coarse);
      candidatesToRefine = coarseScored
        .slice(0, FINE_CANDIDATE_LIMIT)
        .map((entry) => entry.item);
    }

    // Stage 2: Exact badge-masked & outlier-trimmed gradient-correlated match across all offsets
    const scored = candidatesToRefine.map((catItem) => {
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

    slots.push({
      slotId: `slot_${box.index}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      slotNumber: box.index + 1,
      row: box.row + 1,
      col: box.col + 1,
      isPartialRow: !isCollageLayout && box.height < box.portraitHeight * 0.9,
      cropThumbUrl,
      // Auto-skip if no catalog skin meets the confidence threshold
      included: isMatched,
      selectedMatch: isMatched ? topMatch : null,
      candidates: topCandidates,
    });

    onSlotProgress?.({
      slotIndex: i + 1,
      totalSlots: boxes.length,
    });

    // Yield briefly every 2–3 slots so the browser smoothly repaints the live progress bar & percentage
    const yieldStep = boxes.length > 30 ? 3 : 2;
    if (i % yieldStep === yieldStep - 1 || i === boxes.length - 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const layoutLabel = isCollageLayout
    ? `ตารางสกินรวมไร้ขอบ (${detectedCols}×${detectedRows})`
    : isShopLayout
      ? `หน้าร้านค้าสกิน (5×${detectedRows})`
      : `หน้ารายชื่อฮีโร่/สกิน (5×${detectedRows})`;

  return {
    fileName: file.name,
    screenshotUrl: dataUrl,
    detectedCols,
    detectedRows,
    layoutType,
    layoutLabel,
    totalSlots: boxes.length,
    slots,
  };
}


