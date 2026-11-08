import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  Trash2,
  Plus,
  Type,
  Image as ImageIcon,
  Sliders,
  Move,
  Check,
  RefreshCw,
  Layers,
  Copy,
  Eye,
  Heart,
  Square,
  Circle,
} from 'lucide-react';

const SAMPLE_PROFILE_URL = '/assets/aistudio/IMG_0450_a3eca865.jpeg';

const CROP_FADE_PRESETS = [
  {
    id: 'rov_profile_fade',
    label: 'ทรง rov_profile_fade (ตัดขอบบน-ล่าง + เฟดขวาโปร่งใส)',
    desc: 'เหมือนไฟล์ตัวอย่าง rov_profile_fade.png เป๊ะ (ตัดแถบหัว/ท้ายออก เหลือกรอบข้อมูลผู้เล่นด้านซ้ายและเฟดขวาเป็น PNG ว่าง)',
    cropTop: 12,
    cropBottom: 20.5,
    cropLeft: 8,
    cropRight: 0,
    fadeEnabled: true,
    fadeStart: 25,
    fadeEnd: 35,
    keepRightScreenshot: false,
  },
  {
    id: 'full_header_fade',
    label: 'คงแถบ Player Info ด้านบน + เฟดขวา (สไตล์ป้ายตัวอย่าง 1 & 2)',
    desc: 'เก็บโลโก้ Player Info ด้านบนไว้ ตัดเฉพาะปุ่ม Match History ด้านล่าง และเฟดขอบขวาเชื่อมกับรูปพื้นหลัง',
    cropTop: 0,
    cropBottom: 15.5,
    cropLeft: 0,
    cropRight: 0,
    fadeEnabled: true,
    fadeStart: 29,
    fadeEnd: 41,
    keepRightScreenshot: false,
  },
  {
    id: 'full_original_keep_right',
    label: 'ใช้ภาพโปรไฟล์เต็มใบ (เก็บโมเดลสกินฝั่งขวาจากภาพเดิม)',
    desc: 'ใช้ทั้งฝั่งซ้ายและโมเดลสกินฝั่งขวาจากภาพแคปหน้าจอเดียวกัน (ตัดเฉพาะแถบปุ่มด้านล่างออก)',
    cropTop: 0,
    cropBottom: 15.5,
    cropLeft: 0,
    cropRight: 0,
    fadeEnabled: false,
    fadeStart: 30,
    fadeEnd: 45,
    keepRightScreenshot: true,
  },
];

const STICKER_SHAPE_OPTIONS = [
  { id: 'free', label: 'PNG ต้นฉบับ (ไม่ตัดทรง)', icon: ImageIcon },
  { id: 'heart', label: 'กรอบหัวใจ ♡ (โชว์สกิน)', icon: Heart },
  { id: 'square_frame', label: 'กรอบสี่เหลี่ยม (เรียงกรอบรูป)', icon: Square },
  { id: 'rounded', label: 'สี่เหลี่ยมขอบมน', icon: Square },
  { id: 'circle', label: 'วงกลม', icon: Circle },
];

const FONT_OPTIONS = [
  {
    id: 'sans-heavy',
    label: 'โมเดิร์นตัวหนา (แนะนำสำหรับ HERO / SKIN)',
    family: "'Noto Sans Thai', 'Inter', 'Arial Black', sans-serif",
  },
  {
    id: 'impact',
    label: 'ตัวหนาพิเศษ (Impact / Poster)',
    family: "Impact, 'Arial Black', 'Noto Sans Thai', sans-serif",
  },
  {
    id: 'serif',
    label: 'หรูหรา (Playfair / Serif)',
    family: "'Playfair Display', 'Noto Sans Thai', serif",
  },
  {
    id: 'rounded',
    label: 'น่ารักอ่านง่าย (Rounded Thai)',
    family: "'Noto Sans Thai', system-ui, sans-serif",
  },
];

// Helper to draw a heart path inside a bounding box (x, y, w, h)
function traceHeartPath(ctx, x, y, w, h) {
  ctx.beginPath();
  const topCurveHeight = h * 0.3;
  ctx.moveTo(x + w / 2, y + h * 0.22);
  // Left lobe
  ctx.bezierCurveTo(
    x + w / 2,
    y + h * 0.04,
    x + w * 0.04,
    y + h * 0.04,
    x + w * 0.04,
    y + topCurveHeight + h * 0.08
  );
  ctx.bezierCurveTo(
    x + w * 0.04,
    y + h * 0.64,
    x + w * 0.32,
    y + h * 0.8,
    x + w / 2,
    y + h * 0.96
  );
  // Right lobe
  ctx.bezierCurveTo(
    x + w * 0.68,
    y + h * 0.8,
    x + w * 0.96,
    y + h * 0.64,
    x + w * 0.96,
    y + topCurveHeight + h * 0.08
  );
  ctx.bezierCurveTo(
    x + w * 0.96,
    y + h * 0.04,
    x + w / 2,
    y + h * 0.04,
    x + w / 2,
    y + h * 0.22
  );
  ctx.closePath();
}

function traceRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export default function ProfileBannerStudio({
  step,
  setStep,
  selectedSkins,
  heroesById,
  layout,
  setLayout,
  recommendedColsList,
  exportQualityId,
  setExportQualityId,
  exportQualityOptions,
  currentQualityOption,
  sharpenExport,
  setSharpenExport,
  notify,
  pastelPalette,
}) {
  // Active sub-mode synced with top step 3 or step 4
  // Step 3 focuses on Profile Crop & Fade + Filling Empty PNGs
  // Step 4 focuses on Free-Moving Text + Final Export
  const activeTab = step === 4 ? 'text_export' : 'crop_fill';

  // 1. Profile Screenshot & Crop/Fade State (Defaults to rov_profile_fade parameters)
  const [profileImgSrc, setProfileImgSrc] = useState('');
  const [profileNaturalSize, setProfileNaturalSize] = useState({
    w: 1882,
    h: 870,
  });
  const [activePresetId, setActivePresetId] = useState('rov_profile_fade');
  const [cropTop, setCropTop] = useState(12);
  const [cropBottom, setCropBottom] = useState(20.5);
  const [cropLeft, setCropLeft] = useState(8);
  const [cropRight, setCropRight] = useState(0);
  const [fadeEnabled, setFadeEnabled] = useState(true);
  const [fadeStart, setFadeStart] = useState(25);
  const [fadeEnd, setFadeEnd] = useState(35);
  const [bannerHeightRatio, setBannerHeightRatio] = useState(34); // % of banner width (1731:588 ≈ 34%)

  // Generated data URL of the cropped & faded profile (matches rov_profile_fade.png)
  const [fadedProfileDataUrl, setFadedProfileDataUrl] = useState('');

  // 2. Right-Side Background / Splash Artwork State (fills the transparent PNG area)
  const [rightBgMode, setRightBgMode] = useState('custom'); // 'custom' | 'same_screenshot' | 'transparent' | 'dark_blue'
  const [rightBgImgSrc, setRightBgImgSrc] = useState('');
  const [rightBgScale, setRightBgScale] = useState(105);
  const [rightBgOffsetX, setRightBgOffsetX] = useState(14); // shifted slightly right so character stands on the right half
  const [rightBgOffsetY, setRightBgOffsetY] = useState(0);

  // 3. Free-Floating Extra Uploaded PNG / Sticker Layers ("ให้ users อัพโหลดรูปเพิ่มเพื่อเติม png ที่ยังว่าง")
  const [stickerLayers, setStickerLayers] = useState([]);
  const [selectedStickerId, setSelectedStickerId] = useState(null);

  // 4. Free-Moving Text Overlays ("ถัดมา จะเป็นการเติม Text เพื่อให้รูปสำเร็จ โดยให้ Text สามารถเคลื่อนในรูปได้อิสระ")
  const distinctHeroCount = useMemo(() => {
    const ids = new Set(selectedSkins.map((s) => s.heroId).filter(Boolean));
    return ids.size || 67;
  }, [selectedSkins]);

  const [textLayers, setTextLayers] = useState(() => [
    {
      id: 'txt-hero-skin-main',
      text: `HERO ${distinctHeroCount}\n${selectedSkins.length || 119} SKIN`,
      x: 82, // % of banner width
      y: 74, // % of banner height
      fontSize: 44, // relative to 1200px banner width
      fontId: 'sans-heavy',
      color: '#ffffff',
      strokeColor: '#1b1926',
      strokeWidth: 9,
      shadowBlur: 12,
      align: 'center',
      lineHeight: 1.08,
      rotation: 0,
      badgeBg: '',
    },
  ]);
  const [selectedTextId, setSelectedTextId] = useState('txt-hero-skin-main');

  // 5. Optional custom bottom grid image override (if user uploads an existing IMG_0432.png instead of live Step 2 grid)
  const [customBottomGridSrc, setCustomBottomGridSrc] = useState('');
  const [showGridSkinNames, setShowGridSkinNames] = useState(false);
  const [isExportingBanner, setIsExportingBanner] = useState(false);

  const bannerStageRef = useRef(null);
  const dragInteractionRef = useRef(null);
  const profileInputRef = useRef(null);
  const rightBgInputRef = useRef(null);
  const stickerInputRef = useRef(null);
  const customGridInputRef = useRef(null);

  // Load a profile image file or URL and measure its natural dimensions
  const loadProfileImageFromUrl = (url, presetToApply = null) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setProfileNaturalSize({
        w: img.naturalWidth || 1882,
        h: img.naturalHeight || 870,
      });
      setProfileImgSrc(url);
      // If user hasn't set a custom right background yet, also offer the original screenshot as right background fallback
      if (!rightBgImgSrc) {
        setRightBgImgSrc(url);
      }
      if (presetToApply) {
        applyCropFadePreset(presetToApply);
      }
    };
    img.onerror = () => {
      notify?.('ไม่สามารถโหลดรูปโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง');
    };
    img.src = url;
  };

  const applyCropFadePreset = (preset) => {
    setActivePresetId(preset.id);
    setCropTop(preset.cropTop);
    setCropBottom(preset.cropBottom);
    setCropLeft(preset.cropLeft);
    setCropRight(preset.cropRight);
    setFadeEnabled(preset.fadeEnabled);
    setFadeStart(preset.fadeStart);
    setFadeEnd(preset.fadeEnd);
    if (preset.keepRightScreenshot) {
      setRightBgMode('same_screenshot');
    }
  };

  // Auto-generate the cropped & alpha-faded PNG (`rov_profile_fade.png` style) whenever profile or sliders change
  useEffect(() => {
    if (!profileImgSrc) {
      setFadedProfileDataUrl('');
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const srcW = img.naturalWidth || 1882;
      const srcH = img.naturalHeight || 870;

      const sx = Math.round((clampNum(cropLeft, 0, 70) / 100) * srcW);
      const sy = Math.round((clampNum(cropTop, 0, 70) / 100) * srcH);
      const ex = Math.round(
        ((100 - clampNum(cropRight, 0, 70)) / 100) * srcW
      );
      const ey = Math.round(
        ((100 - clampNum(cropBottom, 0, 70)) / 100) * srcH
      );

      const outW = Math.max(64, ex - sx);
      const outH = Math.max(64, ey - sy);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, outW, outH, 0, 0, outW, outH);

      if (fadeEnabled) {
        const startRatio = clampNum(fadeStart, 5, 95) / 100;
        const endRatio =
          Math.max(startRatio + 0.01, clampNum(fadeEnd, 6, 100) / 100);

        ctx.globalCompositeOperation = 'destination-in';
        const grad = ctx.createLinearGradient(0, 0, outW, 0);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(startRatio, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(endRatio, 'rgba(0, 0, 0, 0)');
        if (endRatio < 1) {
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, outW, outH);
        ctx.globalCompositeOperation = 'source-over';
      }

      try {
        const url = canvas.toDataURL('image/png');
        if (!cancelled) {
          setFadedProfileDataUrl(url);
        }
      } catch {
        // Ignore CORS taint if any
      }
    };
    img.src = profileImgSrc;

    return () => {
      cancelled = true;
    };
  }, [
    profileImgSrc,
    cropTop,
    cropBottom,
    cropLeft,
    cropRight,
    fadeEnabled,
    fadeStart,
    fadeEnd,
  ]);

  // Upload handlers
  const handleProfileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        loadProfileImageFromUrl(reader.result);
        notify?.('อัปโหลดภาพโปรไฟล์และตัดเฟดขอบอัตโนมัติเรียบร้อยแล้ว ✨');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRightBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRightBgImgSrc(reader.result);
        setRightBgMode('custom');
        notify?.('อัปโหลดรูปภาพพื้นหลังฝั่งขวาเรียบร้อยแล้ว');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAddStickersUpload = (e) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (!files.length) return;

    files.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const newId = `stk-${Date.now()}-${idx}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        const newLayer = {
          id: newId,
          name: file.name.replace(/\.[^.]+$/, '') || 'PNG Sticker',
          src: reader.result,
          x: 42 + ((stickerLayers.length + idx) % 4) * 10,
          y: 35 + ((stickerLayers.length + idx) % 3) * 18,
          widthPct: 12, // % of banner width
          aspectRatio: 1,
          shape: 'free', // 'free' | 'heart' | 'square_frame' | 'rounded' | 'circle'
          borderColor: '#ffd97d',
          borderWidth: 3,
          ribbonText: '',
          ribbonColor: '#d97724',
          rotation: 0,
        };
        // Measure natural aspect ratio
        const probe = new Image();
        probe.onload = () => {
          const ratio =
            (probe.naturalWidth || 1) / Math.max(1, probe.naturalHeight || 1);
          setStickerLayers((prev) => [
            ...prev,
            { ...newLayer, aspectRatio: ratio },
          ]);
          setSelectedStickerId(newId);
        };
        probe.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    notify?.(`เพิ่มรูป PNG / สติกเกอร์ ${files.length} ชิ้นแล้ว ลากวางในป้ายได้เลย`);
    e.target.value = '';
  };

  // Quick helper: Add a skin from selectedSkins as a Heart Badge or Square Frame sticker on the banner
  const handleAddSkinAsSticker = (skinItem, shape = 'heart', indexOffset = 0) => {
    if (!skinItem) return;
    const heroObj = heroesById[skinItem.heroId];
    const src = skinItem.image || heroObj?.image || '';
    if (!src) return;
    const newId = `stk-skin-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const newSticker = {
      id: newId,
      name: skinItem.name || 'Skin Badge',
      src,
      x: 41,
      y: Math.min(82, 22 + indexOffset * 30),
      widthPct: shape === 'heart' ? 12.5 : 8.5,
      aspectRatio: 1,
      shape,
      borderColor: '#ffd875',
      borderWidth: 3.5,
      ribbonText: shape === 'heart' ? skinItem.tier || 'ULTIMATE' : '',
      ribbonColor: '#d9822b',
      rotation: 0,
    };
    setStickerLayers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newId);
    notify?.(`เพิ่มป้ายสกิน "${skinItem.name}" ลงบนส่วนหัวป้ายแล้ว ลากขยับได้เลย`);
  };

  // Add 3 Heart Showcase Badges at once (just like 09A182EF-D1B6-40C4-9FBE-D0F9267E528C.jpeg!)
  const handleAddThreeHeartShowcase = () => {
    const picks = selectedSkins.slice(0, 3);
    if (!picks.length) {
      notify?.('กรุณาเลือกสกินในหน้า 2 อย่างน้อย 1 รูปก่อน หรือกดอัปโหลดไฟล์ PNG เอง');
      return;
    }
    const defaultRibbons = ['EMPRESSES', 'ULTIMATE', 'FMVP'];
    const created = picks.map((sk, idx) => {
      const heroObj = heroesById[sk.heroId];
      return {
        id: `stk-heart-${Date.now()}-${idx}`,
        name: sk.name || `Showcase #${idx + 1}`,
        src: sk.image || heroObj?.image || '',
        x: 40.5,
        y: 19 + idx * 31,
        widthPct: 12.5,
        aspectRatio: 1,
        shape: 'heart',
        borderColor: '#ffdf85',
        borderWidth: 3.5,
        ribbonText: defaultRibbons[idx] || 'LIMITED',
        ribbonColor: idx === 0 ? '#e06748' : idx === 1 ? '#d89b2b' : '#c98a2c',
        rotation: 0,
      };
    });
    setStickerLayers((prev) => [...prev, ...created]);
    setSelectedStickerId(created[0].id);
    notify?.('สร้างกรอบหัวใจโชว์สกิน 3 ดวงเรียงแนวตั้งตามภาพตัวอย่างแล้ว ♡');
  };

  // Text Layer Helpers
  const handleAddTextLayer = (presetObj = null) => {
    const newId = `txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const baseLayer = presetObj || {
      text: `HERO ${distinctHeroCount}\n${selectedSkins.length || 119} SKIN`,
      x: 78,
      y: 72,
      fontSize: 42,
      fontId: 'sans-heavy',
      color: '#ffffff',
      strokeColor: '#1b1926',
      strokeWidth: 9,
      shadowBlur: 12,
      align: 'center',
      lineHeight: 1.08,
      rotation: 0,
    };
    const next = { ...baseLayer, id: newId };
    setTextLayers((prev) => [...prev, next]);
    setSelectedTextId(newId);
  };

  const updateStickerLayer = (id, patch) => {
    setStickerLayers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateTextLayer = (id, patch) => {
    setTextLayers((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  // Unified Pointer Dragging on the Banner Stage for both Sticker Layers & Text Layers
  const handleLayerPointerDown = (e, type, layer) => {
    e.stopPropagation();
    if (e.button && e.button !== 0) return;
    const stageEl = bannerStageRef.current;
    if (!stageEl) return;

    if (type === 'sticker') {
      setSelectedStickerId(layer.id);
      setSelectedTextId(null);
    } else {
      setSelectedTextId(layer.id);
      setSelectedStickerId(null);
    }

    const stageRect = stageEl.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore capture error
    }

    dragInteractionRef.current = {
      pointerId: e.pointerId,
      type,
      id: layer.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: layer.x,
      startY: layer.y,
      stageWidth: Math.max(1, stageRect.width),
      stageHeight: Math.max(1, stageRect.height),
    };
  };

  const handleLayerPointerMove = (e) => {
    const drag = dragInteractionRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dxPct = ((e.clientX - drag.startClientX) / drag.stageWidth) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / drag.stageHeight) * 100;

    const nextX = clampNum(
      Number((drag.startX + dxPct).toFixed(2)),
      -5,
      105
    );
    const nextY = clampNum(
      Number((drag.startY + dyPct).toFixed(2)),
      -5,
      115
    );

    if (drag.type === 'sticker') {
      updateStickerLayer(drag.id, { x: nextX, y: nextY });
    } else {
      updateTextLayer(drag.id, { x: nextX, y: nextY });
    }
  };

  const handleLayerPointerUp = (e) => {
    const drag = dragInteractionRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    dragInteractionRef.current = null;
  };

  // Download ONLY the cropped & faded profile PNG (`rov_profile_fade.png`)
  const handleDownloadFadedProfileOnly = () => {
    if (!fadedProfileDataUrl) {
      notify?.('กรุณาอัปโหลดรูปโปรไฟล์ก่อนดาวน์โหลด');
      return;
    }
    const link = document.createElement('a');
    link.href = fadedProfileDataUrl;
    link.download = 'rov_profile_fade.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    notify?.('ดาวน์โหลดไฟล์ rov_profile_fade.png (พื้นหลังขวาโปร่งใส) เรียบร้อยแล้ว');
  };

  // Helper to load an Image object safely for Canvas rendering
  const loadImageElement = (src) =>
    new Promise((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // High-Resolution Composite Export (Top Profile Banner + Stickers + Free Text + Bottom Seamless Skin Grid)
  const handleExportFullCompositePoster = async () => {
    setIsExportingBanner(true);
    try {
      const cols = Math.max(1, Math.min(20, Number(layout?.columns) || 10));
      const actualCols =
        selectedSkins.length > 0 ? Math.min(cols, selectedSkins.length) : cols;
      const rows =
        selectedSkins.length > 0 ? Math.ceil(selectedSkins.length / cols) : 0;

      let tileWidth = currentQualityOption?.tileWidth || 330;
      let tileHeight = currentQualityOption?.tileHeight || 540;

      // Ensure total width is at least 1650px even if few columns are chosen
      if (actualCols * tileWidth < 1650) {
        const boost = 1650 / Math.max(1, actualCols * tileWidth);
        tileWidth = Math.round(tileWidth * boost);
        tileHeight = Math.round((tileWidth * 540) / 330);
      }

      const totalWidth = Math.max(1200, actualCols * tileWidth);
      const bannerHeight = Math.round(
        totalWidth * (clampNum(bannerHeightRatio, 20, 60) / 100)
      );

      // Check if user uploaded a custom bottom grid image
      let customGridImg = null;
      let bottomGridHeight = rows * tileHeight;
      if (customBottomGridSrc) {
        customGridImg = await loadImageElement(customBottomGridSrc);
        if (customGridImg && customGridImg.naturalWidth > 0) {
          bottomGridHeight = Math.round(
            (totalWidth * customGridImg.naturalHeight) /
              customGridImg.naturalWidth
          );
        }
      }

      const totalHeight = bannerHeight + bottomGridHeight;
      const canvas = document.createElement('canvas');
      canvas.width = totalWidth;
      canvas.height = Math.max(bannerHeight, totalHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('ไม่สามารถเตรียมพื้นที่สร้างภาพได้');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // ==========================================================
      // PART 1: RENDER TOP PROFILE BANNER (0 .. bannerHeight)
      // ==========================================================
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, totalWidth, bannerHeight);
      ctx.clip();

      // 1A. Base background fill
      if (rightBgMode === 'transparent') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalWidth, bannerHeight);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, totalWidth, 0);
        bgGrad.addColorStop(0, '#1f2b4d');
        bgGrad.addColorStop(0.35, '#25355c');
        bgGrad.addColorStop(1, '#1c2642');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, totalWidth, bannerHeight);
      }

      // 1B. Right-side background / splash artwork
      const effectiveRightBgSrc =
        rightBgMode === 'same_screenshot'
          ? profileImgSrc
          : rightBgMode === 'custom'
            ? rightBgImgSrc
            : '';

      if (effectiveRightBgSrc) {
        const bgImg = await loadImageElement(effectiveRightBgSrc);
        if (bgImg && bgImg.naturalWidth > 0) {
          const scaleFactor = clampNum(rightBgScale, 50, 250) / 100;
          const coverScale = Math.max(
            totalWidth / bgImg.naturalWidth,
            bannerHeight / bgImg.naturalHeight
          );
          const drawW = bgImg.naturalWidth * coverScale * scaleFactor;
          const drawH = bgImg.naturalHeight * coverScale * scaleFactor;
          const centerX =
            totalWidth / 2 + (rightBgOffsetX / 100) * totalWidth;
          const centerY =
            bannerHeight / 2 + (rightBgOffsetY / 100) * bannerHeight;
          ctx.drawImage(
            bgImg,
            centerX - drawW / 2,
            centerY - drawH / 2,
            drawW,
            drawH
          );
        }
      }

      // 1C. Faded & Cropped Left Profile Image (`rov_profile_fade.png`)
      if (fadedProfileDataUrl) {
        const fadedImg = await loadImageElement(fadedProfileDataUrl);
        if (fadedImg && fadedImg.naturalWidth > 0) {
          // Fill the full height of the banner and match proportional width (or full banner width)
          ctx.drawImage(fadedImg, 0, 0, totalWidth, bannerHeight);
        }
      }

      // 1D. Extra Uploaded PNG / Sticker Layers
      for (const stk of stickerLayers) {
        const stkImg = await loadImageElement(stk.src);
        if (!stkImg || !stkImg.naturalWidth) continue;

        const boxW = (stk.widthPct / 100) * totalWidth;
        const aspect =
          stk.shape === 'heart' ||
          stk.shape === 'square_frame' ||
          stk.shape === 'circle'
            ? 1
            : stk.aspectRatio || stkImg.naturalWidth / stkImg.naturalHeight;
        const boxH = boxW / Math.max(0.15, aspect);
        const cx = (stk.x / 100) * totalWidth;
        const cy = (stk.y / 100) * bannerHeight;

        ctx.save();
        ctx.translate(cx, cy);
        if (stk.rotation) {
          ctx.rotate((stk.rotation * Math.PI) / 180);
        }

        const x0 = -boxW / 2;
        const y0 = -boxH / 2;
        const scalePx = totalWidth / 1200;

        if (stk.shape === 'free') {
          ctx.drawImage(stkImg, x0, y0, boxW, boxH);
        } else {
          // Clip inside shape
          ctx.save();
          if (stk.shape === 'heart') {
            traceHeartPath(ctx, x0, y0, boxW, boxH);
          } else if (stk.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, boxW / 2, 0, Math.PI * 2);
          } else if (stk.shape === 'rounded') {
            traceRoundedRect(ctx, x0, y0, boxW, boxH, boxW * 0.16);
          } else {
            ctx.beginPath();
            ctx.rect(x0, y0, boxW, boxH);
          }
          ctx.clip();

          // Center-crop image inside shape
          const imgRatio = stkImg.naturalWidth / stkImg.naturalHeight;
          const targetRatio = boxW / boxH;
          let sx = 0,
            sy = 0,
            sw = stkImg.naturalWidth,
            sh = stkImg.naturalHeight;
          if (imgRatio > targetRatio) {
            sw = stkImg.naturalHeight * targetRatio;
            sx = (stkImg.naturalWidth - sw) / 2;
          } else {
            sh = stkImg.naturalWidth / targetRatio;
            sy = (stkImg.naturalHeight - sh) / 2;
          }
          ctx.drawImage(stkImg, sx, sy, sw, sh, x0, y0, boxW, boxH);
          ctx.restore();

          // Draw shape border
          if (stk.borderWidth > 0) {
            ctx.lineWidth = stk.borderWidth * scalePx;
            ctx.strokeStyle = stk.borderColor || '#ffd875';
            if (stk.shape === 'heart') {
              traceHeartPath(ctx, x0, y0, boxW, boxH);
            } else if (stk.shape === 'circle') {
              ctx.beginPath();
              ctx.arc(0, 0, boxW / 2, 0, Math.PI * 2);
            } else if (stk.shape === 'rounded') {
              traceRoundedRect(ctx, x0, y0, boxW, boxH, boxW * 0.16);
            } else {
              ctx.beginPath();
              ctx.rect(x0, y0, boxW, boxH);
            }
            ctx.stroke();
          }

          // Optional bottom ribbon label (e.g., ULTIMATE / FMVP / EMPRESSES on heart badges)
          if (stk.ribbonText && stk.ribbonText.trim()) {
            const ribW = boxW * 0.76;
            const ribH = boxH * 0.2;
            const ribX = -ribW / 2;
            const ribY = boxH / 2 - ribH * 1.05;

            ctx.fillStyle = stk.ribbonColor || '#d9822b';
            traceRoundedRect(ctx, ribX, ribY, ribW, ribH, ribH * 0.45);
            ctx.fill();
            ctx.lineWidth = 2 * scalePx;
            ctx.strokeStyle = '#fff3c4';
            ctx.stroke();

            ctx.font = `800 ${Math.round(ribH * 0.58)}px 'Noto Sans Thai', sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(stk.ribbonText.trim(), 0, ribY + ribH / 2);
          }
        }
        ctx.restore();
      }

      // 1E. Free-Moving Text Overlays
      const fontScale = totalWidth / 1200;
      for (const txt of textLayers) {
        if (!txt.text || !txt.text.trim()) continue;
        const lines = txt.text.split('\n');
        const fontObj =
          FONT_OPTIONS.find((f) => f.id === txt.fontId) || FONT_OPTIONS[0];
        const pxSize = Math.round((txt.fontSize || 42) * fontScale);
        const lineHeightPx = pxSize * (txt.lineHeight || 1.08);

        const cx = (txt.x / 100) * totalWidth;
        const cy = (txt.y / 100) * bannerHeight;

        ctx.save();
        ctx.translate(cx, cy);
        if (txt.rotation) {
          ctx.rotate((txt.rotation * Math.PI) / 180);
        }

        ctx.font = `900 ${pxSize}px ${fontObj.family}`;
        ctx.textAlign = txt.align || 'center';
        ctx.textBaseline = 'middle';

        const totalBlockH = (lines.length - 1) * lineHeightPx;
        const startY = -totalBlockH / 2;

        lines.forEach((line, idx) => {
          const ly = startY + idx * lineHeightPx;

          // Shadow + thick dark stroke
          if (txt.strokeWidth > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
            ctx.shadowBlur = (txt.shadowBlur ?? 10) * fontScale;
            ctx.shadowOffsetY = 3 * fontScale;
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.lineWidth = txt.strokeWidth * fontScale;
            ctx.strokeStyle = txt.strokeColor || '#1b1926';
            ctx.strokeText(line, 0, ly);
            ctx.restore();
          }

          ctx.fillStyle = txt.color || '#ffffff';
          ctx.fillText(line, 0, ly);
        });

        ctx.restore();
      }

      ctx.restore(); // End top banner clip

      // ==========================================================
      // PART 2: RENDER BOTTOM SEAMLESS SKIN GRID (IMG_0432.png)
      // ==========================================================
      if (customGridImg && customGridImg.naturalWidth > 0) {
        ctx.drawImage(
          customGridImg,
          0,
          bannerHeight,
          totalWidth,
          bottomGridHeight
        );
      } else if (selectedSkins.length > 0) {
        for (let i = 0; i < selectedSkins.length; i++) {
          const item = selectedSkins[i];
          const heroObj = heroesById[item.heroId];
          const imgSrc = item.image || heroObj?.image || '';
          const colIdx = i % actualCols;
          const rowIdx = Math.floor(i / actualCols);
          const left = colIdx * tileWidth;
          const top = bannerHeight + rowIdx * tileHeight;

          ctx.fillStyle =
            heroObj?.color ||
            pastelPalette[i % pastelPalette.length] ||
            '#221c2b';
          ctx.fillRect(left, top, tileWidth, tileHeight);

          const tileImg = await loadImageElement(imgSrc);
          if (tileImg && tileImg.naturalWidth > 0) {
            const sourceRatio = tileImg.naturalWidth / tileImg.naturalHeight;
            const targetRatio = tileWidth / tileHeight;
            let sx = 0,
              sy = 0,
              sw = tileImg.naturalWidth,
              sh = tileImg.naturalHeight;

            if (sourceRatio > targetRatio) {
              sw = tileImg.naturalHeight * targetRatio;
              sx = (tileImg.naturalWidth - sw) / 2;
            } else {
              sh = tileImg.naturalWidth / targetRatio;
              sy = (tileImg.naturalHeight - sh) / 2;
            }
            ctx.drawImage(
              tileImg,
              sx,
              sy,
              sw,
              sh,
              left,
              top,
              tileWidth,
              tileHeight
            );
          }

          // Optional bottom skin name caption if toggled on
          if (showGridSkinNames && item.name) {
            const capH = Math.round(tileHeight * 0.16);
            const capGrad = ctx.createLinearGradient(
              0,
              top + tileHeight - capH,
              0,
              top + tileHeight
            );
            capGrad.addColorStop(0, 'rgba(12, 10, 18, 0)');
            capGrad.addColorStop(0.55, 'rgba(12, 10, 18, 0.65)');
            capGrad.addColorStop(1, 'rgba(12, 10, 18, 0.88)');
            ctx.fillStyle = capGrad;
            ctx.fillRect(left, top + tileHeight - capH, tileWidth, capH);

            ctx.font = `600 ${Math.max(12, Math.round(tileWidth * 0.068))}px 'Noto Sans Thai', sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(
              item.name,
              left + tileWidth / 2,
              top + tileHeight - Math.round(tileHeight * 0.025),
              tileWidth * 0.92
            );
          }
        }
      }

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('ไม่สามารถสร้างไฟล์ PNG ได้');

      const filename = `rov-profile-banner-${selectedSkins.length}skins-${canvas.width}x${canvas.height}.png`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      notify?.('ดาวน์โหลดป้ายไอดี RoV สำเร็จรูป (ส่วนหัวโปรไฟล์ + ตารางสกิน) เรียบร้อยแล้ว! ✨');
    } catch (err) {
      notify?.(err?.message || 'เกิดข้อผิดพลาดในการสร้างป้ายสำเร็จรูป');
    } finally {
      setIsExportingBanner(false);
    }
  };

  const selectedSticker =
    stickerLayers.find((s) => s.id === selectedStickerId) || null;
  const selectedText =
    textLayers.find((t) => t.id === selectedTextId) || textLayers[0] || null;

  const actualColsForPreview = Math.max(
    1,
    Math.min(20, Number(layout?.columns) || 10)
  );

  return (
    <div className="panel bannerStudioPanel">
      {/* Studio Sub-Step Switcher Header (Menu 3 & Menu 4) */}
      <div className="bannerStudioTopBar">
        <div className="bannerStudioTitleSide">
          <span className="eyebrow">
            ROV PROFILE BANNER + SEAMLESS SKIN GRID STUDIO
          </span>
          <h3>
            <Sparkles size={18} /> สตูดิโอตัดป้ายไอดี RoV สำเร็จรูป (โปรไฟล์เฟด
            + เติมรูป PNG + ข้อความอิสระ + ตารางสกิน)
          </h3>
        </div>

        <div className="bannerStudioStepTabs">
          <button
            type="button"
            className={
              'studioModeTabBtn ' + (activeTab === 'crop_fill' ? 'active' : '')
            }
            onClick={() => setStep(3)}
          >
            <span>3</span> ตัดโปรไฟล์เฟด & เติมรูป PNG ที่ว่าง
          </button>
          <button
            type="button"
            className={
              'studioModeTabBtn ' +
              (activeTab === 'text_export' ? 'active' : '')
            }
            onClick={() => setStep(4)}
          >
            <span>4</span> เติมข้อความอิสระ & ดาวน์โหลดป้ายสำเร็จรูป
          </button>
        </div>
      </div>

      {/* Main 2-Column Studio Workspace: Left = Step Controls, Right = Live Interactive Poster Canvas */}
      <div className="bannerStudioMainGrid">
        {/* ============================================================
            LEFT COLUMN: CONTROLS FOR STEP 3 OR STEP 4
           ============================================================ */}
        <div className="bannerStudioSidebar">
          {activeTab === 'crop_fill' ? (
            <>
              {/* STEP 3.1: Upload Profile Screenshot & Auto Crop + Fade (`IMG_0450` -> `rov_profile_fade.png`) */}
              <div className="studioCardBox">
                <div className="studioCardHead">
                  <b>1. อัปโหลดหน้าโปรไฟล์ & ครอบตัดเฟดขอบ</b>
                  <span className="studioStepBadge">rov_profile_fade</span>
                </div>
                <p className="studioCardHint">
                  อัปโหลดภาพแคปหน้าจอ Player Info (เช่น IMG_0450) ระบบจะครอบตัดและเฟดขอบขวาให้เป็น PNG โปร่งใสเหมือนตัวอย่างอัตโนมัติ
                </p>

                <div className="studioUploadBtnRow">
                  <label className="primary studioUploadBtn">
                    <Upload size={14} /> อัปโหลดภาพหน้าโปรไฟล์
                    <input
                      ref={profileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handleProfileUpload}
                    />
                  </label>

                  <button
                    type="button"
                    className="secondary studioSampleBtn"
                    onClick={() => {
                      loadProfileImageFromUrl(
                        SAMPLE_PROFILE_URL,
                        CROP_FADE_PRESETS[0]
                      );
                      notify?.(
                        'โหลดภาพตัวอย่าง IMG_0450 พร้อมตัดและเฟดเป็นทรง rov_profile_fade.png แล้ว!'
                      );
                    }}
                  >
                    <Sparkles size={13} /> ลองใช้ภาพตัวอย่าง (IMG_0450)
                  </button>
                </div>

                {/* Preset Pills */}
                <div className="studioPresetList">
                  {CROP_FADE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={
                        'studioPresetItem ' +
                        (activePresetId === preset.id ? 'active' : '')
                      }
                      onClick={() => applyCropFadePreset(preset)}
                    >
                      <div>
                        <b>{preset.label}</b>
                        <small>{preset.desc}</small>
                      </div>
                      {activePresetId === preset.id && <Check size={14} />}
                    </button>
                  ))}
                </div>

                {/* Live Mini Preview of the Cropped & Faded PNG (`rov_profile_fade.png`) */}
                {fadedProfileDataUrl && (
                  <div className="fadedProfileMiniPreviewBox">
                    <div className="fadedMiniTopRow">
                      <span>ผลลัพธ์การครอบ & เฟดโปร่งใส (rov_profile_fade.png):</span>
                      <button
                        type="button"
                        className="tinyDownloadFadeBtn"
                        onClick={handleDownloadFadedProfileOnly}
                      >
                        <Download size={11} /> โหลดเฉพาะ PNG เฟดนี้
                      </button>
                    </div>
                    <div className="checkerboardPreviewFrame">
                      <img
                        src={fadedProfileDataUrl}
                        alt="Cropped and faded RoV profile"
                      />
                    </div>
                  </div>
                )}

                {/* Fine-Tune Sliders for Crop & Fade */}
                <div className="studioSlidersGrid">
                  <div className="studioSliderRow">
                    <label>
                      <span>ครอบขอบบน (Top)</span>
                      <b className="tabular">{cropTop}%</b>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={35}
                      step={0.5}
                      value={cropTop}
                      onChange={(e) => {
                        setActivePresetId('custom');
                        setCropTop(Number(e.target.value));
                      }}
                    />
                  </div>

                  <div className="studioSliderRow">
                    <label>
                      <span>ครอบขอบล่าง (Bottom)</span>
                      <b className="tabular">{cropBottom}%</b>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={35}
                      step={0.5}
                      value={cropBottom}
                      onChange={(e) => {
                        setActivePresetId('custom');
                        setCropBottom(Number(e.target.value));
                      }}
                    />
                  </div>

                  <div className="studioSliderRow">
                    <label>
                      <span>ครอบขอบซ้าย (Left)</span>
                      <b className="tabular">{cropLeft}%</b>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={25}
                      step={0.5}
                      value={cropLeft}
                      onChange={(e) => {
                        setActivePresetId('custom');
                        setCropLeft(Number(e.target.value));
                      }}
                    />
                  </div>

                  <div className="studioSliderRow">
                    <label>
                      <span>จุดเริ่มเฟดขวา (Fade Start)</span>
                      <b className="tabular">{fadeStart}%</b>
                    </label>
                    <input
                      type="range"
                      min={12}
                      max={85}
                      step={0.5}
                      value={fadeStart}
                      onChange={(e) => {
                        setActivePresetId('custom');
                        setFadeEnabled(true);
                        const val = Number(e.target.value);
                        setFadeStart(val);
                        if (fadeEnd <= val + 2) setFadeEnd(val + 8);
                      }}
                    />
                  </div>

                  <div className="studioSliderRow">
                    <label>
                      <span>จุดสิ้นสุดเฟด (Fade End)</span>
                      <b className="tabular">{fadeEnd}%</b>
                    </label>
                    <input
                      type="range"
                      min={15}
                      max={100}
                      step={0.5}
                      value={fadeEnd}
                      onChange={(e) => {
                        setActivePresetId('custom');
                        setFadeEnabled(true);
                        setFadeEnd(
                          Math.max(fadeStart + 1, Number(e.target.value))
                        );
                      }}
                    />
                  </div>

                  <div className="studioSliderRow">
                    <label>
                      <span>สัดส่วนความสูงหัวป้าย</span>
                      <b className="tabular">{bannerHeightRatio}%</b>
                    </label>
                    <input
                      type="range"
                      min={24}
                      max={50}
                      step={1}
                      value={bannerHeightRatio}
                      onChange={(e) =>
                        setBannerHeightRatio(Number(e.target.value))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* STEP 3.2: Fill Empty Transparent Right Area (Background Artwork + Extra Uploaded PNG Stickers) */}
              <div className="studioCardBox">
                <div className="studioCardHead">
                  <b>2. เติมรูปในพื้นที่ PNG ที่ยังว่าง (พื้นหลังขวา & สติกเกอร์)</b>
                  <span className="studioStepBadge">Fill PNG</span>
                </div>
                <p className="studioCardHint">
                  เลือกภาพพื้นหลังมาเติมฝั่งขวาที่เฟดว่างไว้ และอัปโหลดรูป PNG/กรอบรูป/ป้ายหัวใจเพิ่มเพื่อลากวางได้อิสระ
                </p>

                {/* Right Background Source Mode */}
                <div className="rightBgModeTabs">
                  <button
                    type="button"
                    className={rightBgMode === 'custom' ? 'active' : ''}
                    onClick={() => rightBgInputRef.current?.click()}
                  >
                    <Upload size={12} /> อัปโหลดรูปพื้นหลังขวา
                  </button>
                  <button
                    type="button"
                    className={
                      rightBgMode === 'same_screenshot' ? 'active' : ''
                    }
                    onClick={() => setRightBgMode('same_screenshot')}
                  >
                    ใช้ฝั่งขวาของรูปโปรไฟล์
                  </button>
                  <button
                    type="button"
                    className={rightBgMode === 'transparent' ? 'active' : ''}
                    onClick={() => setRightBgMode('transparent')}
                  >
                    พื้นขาว/โปร่งใส
                  </button>
                  <input
                    ref={rightBgInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleRightBgUpload}
                  />
                </div>

                {(rightBgMode === 'custom' ||
                  rightBgMode === 'same_screenshot') && (
                  <div className="studioSlidersGrid compactSliders">
                    <div className="studioSliderRow">
                      <label>
                        <span>ซูมรูปฝั่งขวา (Scale)</span>
                        <b className="tabular">{rightBgScale}%</b>
                      </label>
                      <input
                        type="range"
                        min={60}
                        max={200}
                        step={1}
                        value={rightBgScale}
                        onChange={(e) =>
                          setRightBgScale(Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="studioSliderRow">
                      <label>
                        <span>เลื่อนซ้าย-ขวา (X)</span>
                        <b className="tabular">{rightBgOffsetX}%</b>
                      </label>
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        step={1}
                        value={rightBgOffsetX}
                        onChange={(e) =>
                          setRightBgOffsetX(Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="studioSliderRow">
                      <label>
                        <span>เลื่อนขึ้น-ลง (Y)</span>
                        <b className="tabular">{rightBgOffsetY}%</b>
                      </label>
                      <input
                        type="range"
                        min={-50}
                        max={50}
                        step={1}
                        value={rightBgOffsetY}
                        onChange={(e) =>
                          setRightBgOffsetY(Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                )}

                <hr className="studioDivider" />

                {/* Extra PNG / Sticker Overlays Upload & Quick Showcase Generators */}
                <div className="studioUploadBtnRow">
                  <label className="primary studioUploadBtn">
                    <Plus size={14} /> อัปโหลดรูป PNG / สติกเกอร์เพิ่ม
                    <input
                      ref={stickerInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={handleAddStickersUpload}
                    />
                  </label>

                  <button
                    type="button"
                    className="secondary studioSampleBtn"
                    onClick={handleAddThreeHeartShowcase}
                    title="ดึง 3 สกินแรกจากตารางมาสร้างป้ายหัวใจเรียง 3 ดวงตรงกลางเหมือนภาพตัวอย่าง"
                  >
                    <Heart size={13} /> สร้างป้ายหัวใจ 3 สกิน ♡
                  </button>
                </div>

                {/* Selected Sticker Inspector */}
                {selectedSticker && (
                  <div className="selectedLayerInspector">
                    <div className="inspectorHeader">
                      <b>แก้ไขรูปที่เลือก: {selectedSticker.name}</b>
                      <button
                        type="button"
                        className="iconTrashBtn"
                        onClick={() => {
                          setStickerLayers((prev) =>
                            prev.filter((s) => s.id !== selectedSticker.id)
                          );
                          setSelectedStickerId(null);
                        }}
                        title="ลบรูปนี้"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="shapeOptionPills">
                      {STICKER_SHAPE_OPTIONS.map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          className={
                            'shapePillBtn ' +
                            (selectedSticker.shape === sh.id ? 'active' : '')
                          }
                          onClick={() =>
                            updateStickerLayer(selectedSticker.id, {
                              shape: sh.id,
                            })
                          }
                        >
                          {sh.label}
                        </button>
                      ))}
                    </div>

                    <div className="studioSlidersGrid compactSliders">
                      <div className="studioSliderRow">
                        <label>
                          <span>ขนาดรูป (Width)</span>
                          <b className="tabular">{selectedSticker.widthPct}%</b>
                        </label>
                        <input
                          type="range"
                          min={4}
                          max={60}
                          step={0.5}
                          value={selectedSticker.widthPct}
                          onChange={(e) =>
                            updateStickerLayer(selectedSticker.id, {
                              widthPct: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="studioSliderRow">
                        <label>
                          <span>หมุนเอียง (Rotate)</span>
                          <b className="tabular">
                            {selectedSticker.rotation || 0}°
                          </b>
                        </label>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={1}
                          value={selectedSticker.rotation || 0}
                          onChange={(e) =>
                            updateStickerLayer(selectedSticker.id, {
                              rotation: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>

                    {selectedSticker.shape !== 'free' && (
                      <div className="stickerExtraRow">
                        <label>
                          ป้ายชื่อใต้กรอบ (เช่น ULTIMATE / FMVP):
                          <input
                            value={selectedSticker.ribbonText || ''}
                            onChange={(e) =>
                              updateStickerLayer(selectedSticker.id, {
                                ribbonText: e.target.value,
                              })
                            }
                            placeholder="เว้นว่างได้หากไม่ต้องการป้ายชื่อ"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className="primary fullWidthNextStepBtn"
                  onClick={() => setStep(4)}
                >
                  ถัดไป: เติมข้อความ (Text) & ส่งออกป้ายสำเร็จรูป →
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ============================================================
                  STEP 4: FREE-MOVING TEXT OVERLAYS & FINAL COMPOSITE EXPORT
                 ============================================================ */}
              <div className="studioCardBox">
                <div className="studioCardHead">
                  <b>3. เติมข้อความ (Text) ลากวางในรูปได้อิสระ</b>
                  <span className="studioStepBadge">Free Move Text</span>
                </div>
                <p className="studioCardHint">
                  คลิกเพิ่มข้อความแล้วแตะลากข้อความไปวางตรงไหนของรูปก็ได้ ปรับขนาด สี ขอบดำ และฟอนต์ได้ตามต้องการ
                </p>

                {/* Quick 1-Click Text Templates matching Reference Images 1 & 2 */}
                <div className="textPresetButtonsGrid">
                  <button
                    type="button"
                    className="textPresetBtn"
                    onClick={() =>
                      handleAddTextLayer({
                        text: `HERO ${distinctHeroCount}\n${
                          selectedSkins.length || 119
                        } SKIN`,
                        x: 82,
                        y: 74,
                        fontSize: 44,
                        fontId: 'sans-heavy',
                        color: '#ffffff',
                        strokeColor: '#1b1926',
                        strokeWidth: 9,
                        shadowBlur: 12,
                        align: 'center',
                        lineHeight: 1.08,
                        rotation: 0,
                      })
                    }
                  >
                    + สไตล์ภาพ 1 (HERO {distinctHeroCount} /{' '}
                    {selectedSkins.length || 119} SKIN)
                  </button>

                  <button
                    type="button"
                    className="textPresetBtn"
                    onClick={() =>
                      handleAddTextLayer({
                        text: `${distinctHeroCount}   ${
                          selectedSkins.length || 65
                        }\nHERO   SKIN`,
                        x: 84,
                        y: 80,
                        fontSize: 40,
                        fontId: 'sans-heavy',
                        color: '#ffffff',
                        strokeColor: '#1f1c2b',
                        strokeWidth: 9,
                        shadowBlur: 12,
                        align: 'center',
                        lineHeight: 1.05,
                        rotation: 0,
                      })
                    }
                  >
                    + สไตล์ภาพ 2 ({distinctHeroCount} HERO /{' '}
                    {selectedSkins.length || 65} SKIN)
                  </button>

                  <button
                    type="button"
                    className="textPresetBtn"
                    onClick={() =>
                      handleAddTextLayer({
                        text: '×810\n( ลิมิเต็ด )',
                        x: 93,
                        y: 44,
                        fontSize: 22,
                        fontId: 'sans-heavy',
                        color: '#ffffff',
                        strokeColor: '#1f1c2b',
                        strokeWidth: 6,
                        shadowBlur: 8,
                        align: 'center',
                        lineHeight: 1.1,
                        rotation: 0,
                      })
                    }
                  >
                    + ป้ายไอเทม (×810 ลิมิเต็ด)
                  </button>

                  <button
                    type="button"
                    className="textPresetBtn primaryTextAddBtn"
                    onClick={() =>
                      handleAddTextLayer({
                        text: 'พิมพ์ข้อความของคุณ...',
                        x: 65,
                        y: 50,
                        fontSize: 34,
                        fontId: 'sans-heavy',
                        color: '#ffffff',
                        strokeColor: '#1b1926',
                        strokeWidth: 7,
                        shadowBlur: 10,
                        align: 'center',
                        lineHeight: 1.1,
                        rotation: 0,
                      })
                    }
                  >
                    <Plus size={13} /> เพิ่มข้อความใหม่เอง
                  </button>
                </div>

                {/* List of Text Layers */}
                {textLayers.length > 0 && (
                  <div className="textLayersPillStrip">
                    {textLayers.map((t, i) => (
                      <button
                        key={t.id}
                        type="button"
                        className={
                          'textLayerChip ' +
                          (selectedText?.id === t.id ? 'active' : '')
                        }
                        onClick={() => setSelectedTextId(t.id)}
                      >
                        <Type size={11} />
                        <span>
                          {t.text.replace(/\n/g, ' ').slice(0, 18) ||
                            `ข้อความ #${i + 1}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Active Text Layer Editor */}
                {selectedText && (
                  <div className="selectedLayerInspector">
                    <div className="inspectorHeader">
                      <b>แก้ไขข้อความที่เลือก (ลากในรูปได้อิสระ)</b>
                      <button
                        type="button"
                        className="iconTrashBtn"
                        onClick={() => {
                          setTextLayers((prev) =>
                            prev.filter((t) => t.id !== selectedText.id)
                          );
                          setSelectedTextId(null);
                        }}
                        title="ลบข้อความนี้"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <textarea
                      rows={2}
                      className="studioTextArea"
                      value={selectedText.text}
                      onChange={(e) =>
                        updateTextLayer(selectedText.id, {
                          text: e.target.value,
                        })
                      }
                      placeholder="พิมพ์ข้อความ (กด Enter เพื่อขึ้นบรรทัดใหม่ได้)..."
                    />

                    <div className="studioFieldRow">
                      <label>ฟอนต์:</label>
                      <select
                        value={selectedText.fontId || 'sans-heavy'}
                        onChange={(e) =>
                          updateTextLayer(selectedText.id, {
                            fontId: e.target.value,
                          })
                        }
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="studioSlidersGrid compactSliders">
                      <div className="studioSliderRow">
                        <label>
                          <span>ขนาดตัวอักษร (Size)</span>
                          <b className="tabular">{selectedText.fontSize}px</b>
                        </label>
                        <input
                          type="range"
                          min={14}
                          max={96}
                          step={1}
                          value={selectedText.fontSize}
                          onChange={(e) =>
                            updateTextLayer(selectedText.id, {
                              fontSize: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="studioSliderRow">
                        <label>
                          <span>ความหนาขอบตัวอักษร (Outline)</span>
                          <b className="tabular">
                            {selectedText.strokeWidth}px
                          </b>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={18}
                          step={0.5}
                          value={selectedText.strokeWidth}
                          onChange={(e) =>
                            updateTextLayer(selectedText.id, {
                              strokeWidth: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div className="studioSliderRow">
                        <label>
                          <span>หมุนเอียง (Rotate)</span>
                          <b className="tabular">
                            {selectedText.rotation || 0}°
                          </b>
                        </label>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={1}
                          value={selectedText.rotation || 0}
                          onChange={(e) =>
                            updateTextLayer(selectedText.id, {
                              rotation: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="colorPickersInlineRow">
                      <label className="colorSwatchLabel">
                        <span>สีตัวอักษร:</span>
                        <input
                          type="color"
                          value={selectedText.color || '#ffffff'}
                          onChange={(e) =>
                            updateTextLayer(selectedText.id, {
                              color: e.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="colorSwatchLabel">
                        <span>สีขอบตัวอักษร:</span>
                        <input
                          type="color"
                          value={selectedText.strokeColor || '#1b1926'}
                          onChange={(e) =>
                            updateTextLayer(selectedText.id, {
                              strokeColor: e.target.value,
                            })
                          }
                        />
                      </label>

                      <div className="alignBtnsGroup">
                        {['left', 'center', 'right'].map((al) => (
                          <button
                            key={al}
                            type="button"
                            className={
                              selectedText.align === al ? 'active' : ''
                            }
                            onClick={() =>
                              updateTextLayer(selectedText.id, { align: al })
                            }
                          >
                            {al === 'left'
                              ? 'ซ้าย'
                              : al === 'center'
                                ? 'กลาง'
                                : 'ขวา'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* STEP 4.2: Bottom Skin Grid Settings & Final Export */}
              <div className="studioCardBox">
                <div className="studioCardHead">
                  <b>4. ตารางสกินด้านล่าง & ส่งออกป้ายสำเร็จรูป</b>
                  <span className="studioStepBadge">
                    {selectedSkins.length} สกิน
                  </span>
                </div>

                <div className="studioSliderRow">
                  <label>
                    <span>จำนวนสกินต่อแถว (ตารางด้านล่าง)</span>
                    <b className="tabular">{actualColsForPreview} รูป/แถว</b>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={actualColsForPreview}
                    onChange={(e) =>
                      setLayout({
                        ...layout,
                        columns: Number(e.target.value),
                      })
                    }
                  />
                </div>

                {recommendedColsList?.length > 0 && (
                  <div className="studioRecChips">
                    {recommendedColsList.map((rec) => (
                      <button
                        key={rec.cols}
                        type="button"
                        className={
                          'recColBtn ' +
                          (actualColsForPreview === rec.cols ? 'active' : '')
                        }
                        onClick={() =>
                          setLayout({ ...layout, columns: rec.cols })
                        }
                      >
                        <b>{rec.cols} รูป/แถว</b>
                        <small>({rec.reason})</small>
                      </button>
                    ))}
                  </div>
                )}

                <div className="studioUploadBtnRow" style={{ marginTop: 8 }}>
                  <label className="secondary studioSampleBtn">
                    <Upload size={13} />{' '}
                    {customBottomGridSrc
                      ? 'เปลี่ยนไฟล์รูปตารางด้านล่าง'
                      : 'หรืออัปโหลดรูปตารางสำเร็จรูป (เช่น IMG_0432)'}
                    <input
                      ref={customGridInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = () => {
                          if (typeof r.result === 'string') {
                            setCustomBottomGridSrc(r.result);
                            notify?.(
                              'ใช้รูปตารางสกินที่อัปโหลดสำหรับส่วนล่างของป้ายแล้ว'
                            );
                          }
                        };
                        r.readAsDataURL(f);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {customBottomGridSrc && (
                    <button
                      type="button"
                      className="secondary studioSampleBtn"
                      onClick={() => setCustomBottomGridSrc('')}
                    >
                      กลับไปใช้ตารางสกินจากในเว็บ ({selectedSkins.length} รูป)
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="primary studioFinalExportBtn"
                  disabled={isExportingBanner}
                  onClick={handleExportFullCompositePoster}
                >
                  <Download size={16} />{' '}
                  {isExportingBanner
                    ? 'กำลังประมวลผลป้ายความละเอียดสูง...'
                    : 'ดาวน์โหลดป้ายไอดีสำเร็จรูป (PNG คมชัดสูง)'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ============================================================
            RIGHT COLUMN: LIVE INTERACTIVE COMPOSITE POSTER PREVIEW
            (Top = Cropped & Faded Profile + Right Art + Draggable PNGs + Draggable Text)
            (Bottom = Seamless Skin Collage Grid from Step 2 / IMG_0432.png)
           ============================================================ */}
        <div className="bannerStudioPreviewColumn">
          <div className="studioPreviewToolbar">
            <div className="studioPreviewTitle">
              <span className="boardStatusDot" />
              <b>พรีวิวป้ายไอดีสำเร็จรูป (แตะลากรูป PNG และข้อความในป้ายได้อิสระ)</b>
            </div>

            <div className="studioPreviewActions">
              {fadedProfileDataUrl && (
                <button
                  type="button"
                  className="boardToolBtn"
                  onClick={handleDownloadFadedProfileOnly}
                >
                  <Download size={13} /> โหลดเฉพาะหัวโปรไฟล์ที่เฟด (PNG)
                </button>
              )}

              <button
                type="button"
                className="primary boardDownloadBtn"
                disabled={isExportingBanner}
                onClick={handleExportFullCompositePoster}
              >
                <Download size={14} />{' '}
                {isExportingBanner
                  ? 'กำลังสร้าง...'
                  : 'ดาวน์โหลดป้ายสำเร็จรูป (PNG)'}
              </button>
            </div>
          </div>

          {/* Unified Composite Poster Frame */}
          <div className="compositePosterScrollWrap">
            <div className="compositePosterSheet">
              {/* ==================================================
                  TOP SECTION: PROFILE BANNER STAGE
                 ================================================== */}
              <div
                ref={bannerStageRef}
                className={
                  'compositeTopBannerStage ' +
                  (rightBgMode === 'transparent' ? 'checkerboardStage' : '')
                }
                style={{
                  aspectRatio: `100 / ${clampNum(bannerHeightRatio, 20, 60)}`,
                }}
                onClick={() => {
                  setSelectedStickerId(null);
                }}
              >
                {/* Layer 1: Right-Side Background / Splash Art */}
                {(rightBgMode === 'custom' ||
                  rightBgMode === 'same_screenshot') &&
                  (rightBgMode === 'same_screenshot'
                    ? profileImgSrc
                    : rightBgImgSrc) && (
                    <img
                      src={
                        rightBgMode === 'same_screenshot'
                          ? profileImgSrc
                          : rightBgImgSrc
                      }
                      alt="Right background art"
                      className="bannerRightBgImg"
                      style={{
                        transform: `translate(${rightBgOffsetX}%, ${rightBgOffsetY}%) scale(${
                          rightBgScale / 100
                        })`,
                      }}
                      draggable={false}
                    />
                  )}

                {/* Layer 2: Cropped & Right-Edge-Faded Profile (`rov_profile_fade.png`) */}
                {fadedProfileDataUrl ? (
                  <img
                    src={fadedProfileDataUrl}
                    alt="Faded RoV Profile"
                    className="bannerFadedProfileImg"
                    draggable={false}
                  />
                ) : (
                  <div
                    className="bannerEmptyProfilePrompt"
                    onClick={() => profileInputRef.current?.click()}
                  >
                    <Upload size={22} />
                    <b>คลิกเพื่ออัปโหลดภาพหน้าโปรไฟล์ RoV (เช่น IMG_0450)</b>
                    <small>
                      หรือกดปุ่ม “ลองใช้ภาพตัวอย่าง (IMG_0450)” ด้านซ้ายเพื่อดูการตัดและเฟดอัตโนมัติ
                    </small>
                  </div>
                )}

                {/* Layer 3: Draggable Extra PNG / Sticker Layers */}
                {stickerLayers.map((stk) => {
                  const isSel = selectedStickerId === stk.id;
                  return (
                    <div
                      key={stk.id}
                      className={
                        'draggableBannerSticker ' +
                        `shape-${stk.shape} ` +
                        (isSel ? 'selectedLayer' : '')
                      }
                      style={{
                        left: `${stk.x}%`,
                        top: `${stk.y}%`,
                        width: `${stk.widthPct}%`,
                        transform: `translate(-50%, -50%) rotate(${
                          stk.rotation || 0
                        }deg)`,
                      }}
                      onPointerDown={(e) =>
                        handleLayerPointerDown(e, 'sticker', stk)
                      }
                      onPointerMove={handleLayerPointerMove}
                      onPointerUp={handleLayerPointerUp}
                      onPointerCancel={handleLayerPointerUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStickerId(stk.id);
                      }}
                    >
                      <div
                        className="stickerShapeInner"
                        style={{
                          borderColor:
                            stk.shape !== 'free'
                              ? stk.borderColor || '#ffd875'
                              : 'transparent',
                          borderWidth:
                            stk.shape !== 'free'
                              ? `${stk.borderWidth || 2.5}px`
                              : 0,
                        }}
                      >
                        <img
                          src={stk.src}
                          alt={stk.name}
                          referrerPolicy="no-referrer"
                          draggable={false}
                        />
                      </div>

                      {stk.shape !== 'free' && stk.ribbonText && (
                        <span
                          className="stickerRibbonTag"
                          style={{
                            background: stk.ribbonColor || '#d9822b',
                          }}
                        >
                          {stk.ribbonText}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Layer 4: Freely Draggable Text Overlays */}
                {textLayers.map((txt) => {
                  if (!txt.text) return null;
                  const isSel = selectedTextId === txt.id;
                  const fontObj =
                    FONT_OPTIONS.find((f) => f.id === txt.fontId) ||
                    FONT_OPTIONS[0];

                  return (
                    <div
                      key={txt.id}
                      className={
                        'draggableBannerText ' + (isSel ? 'selectedLayer' : '')
                      }
                      style={{
                        left: `${txt.x}%`,
                        top: `${txt.y}%`,
                        transform: `translate(-50%, -50%) rotate(${
                          txt.rotation || 0
                        }deg)`,
                        fontFamily: fontObj.family,
                        fontSize: `clamp(13px, ${(txt.fontSize / 1200) * 68}vw, ${txt.fontSize}px)`,
                        color: txt.color || '#ffffff',
                        textAlign: txt.align || 'center',
                        lineHeight: txt.lineHeight || 1.08,
                        WebkitTextStroke:
                          txt.strokeWidth > 0
                            ? `${Math.max(1, txt.strokeWidth * 0.35)}px ${
                                txt.strokeColor || '#1b1926'
                              }`
                            : 'none',
                        textShadow:
                          txt.strokeWidth > 0
                            ? `0 2px 8px rgba(0,0,0,0.75), 0 0 2px ${
                                txt.strokeColor || '#1b1926'
                              }`
                            : '0 2px 6px rgba(0,0,0,0.65)',
                      }}
                      onPointerDown={(e) =>
                        handleLayerPointerDown(e, 'text', txt)
                      }
                      onPointerMove={handleLayerPointerMove}
                      onPointerUp={handleLayerPointerUp}
                      onPointerCancel={handleLayerPointerUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTextId(txt.id);
                      }}
                      title="แตะค้างแล้วลากเพื่อย้ายตำแหน่งข้อความได้อย่างอิสระ"
                    >
                      {txt.text.split('\n').map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* ==================================================
                  BOTTOM SECTION: SEAMLESS SKIN GRID (Matches IMG_0432.png)
                 ================================================== */}
              {customBottomGridSrc ? (
                <div className="compositeCustomBottomGrid">
                  <img
                    src={customBottomGridSrc}
                    alt="Bottom Skin Collage Grid"
                  />
                </div>
              ) : selectedSkins.length > 0 ? (
                <div
                  className="compositeBottomSkinGrid"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(
                      actualColsForPreview,
                      selectedSkins.length
                    )}, minmax(0, 1fr))`,
                  }}
                >
                  {selectedSkins.map((item, idx) => {
                    const heroObj = heroesById[item.heroId];
                    const imgSrc = item.image || heroObj?.image || '';
                    const tileBg =
                      heroObj?.color ||
                      pastelPalette[idx % pastelPalette.length];

                    return (
                      <div
                        key={item.uid}
                        className="seamlessSkinTile"
                        style={{ background: tileBg }}
                      >
                        {imgSrc && (
                          <img
                            src={imgSrc}
                            alt={item.name || ''}
                            referrerPolicy="no-referrer"
                            draggable={false}
                          />
                        )}
                        {showGridSkinNames && item.name && (
                          <div className="floatingSkinBottomCaption">
                            <b>{item.name}</b>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="compositeBottomEmptyNotice">
                  <span>
                    ยังไม่ได้เลือกสกินในตารางด้านล่าง —{' '}
                    <button
                      type="button"
                      className="inlineLinkBtn"
                      onClick={() => setStep(2)}
                    >
                      กลับไปหน้า 2 เพื่อเลือกสกิน
                    </button>{' '}
                    หรือ{' '}
                    <button
                      type="button"
                      className="inlineLinkBtn"
                      onClick={() => customGridInputRef.current?.click()}
                    >
                      อัปโหลดรูปตารางสกินสำเร็จรูป (เช่น IMG_0432.png)
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="boardHintFooter">
            <span>
              💡 <b>วิธีใช้งาน:</b> 1) อัปโหลดหน้าโปรไฟล์เพื่อตัดและเฟดขอบขวาเป็น{' '}
              <code>rov_profile_fade.png</code> · 2) เติมรูปพื้นหลังขวาและอัปโหลดรูป PNG/ป้ายหัวใจเพิ่ม · 3) ลากข้อความ (เช่น{' '}
              <b>HERO 67 / 119 SKIN</b>) ไปวางจุดไหนก็ได้ แล้วกด{' '}
              <b>ดาวน์โหลดป้ายสำเร็จรูป (PNG)</b>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function clampNum(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
