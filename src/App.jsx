import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLogin from './components/AdminLogin';
import {
  Heart,
  Sparkles,
  Search,
  Download,
  ArrowLeft,
  ArrowRight,
  Upload,
  Link2,
  Plus,
  Trash2,
  Layers,
  Check,
  Image as ImageIcon,
  FolderHeart,
  Edit3,
  Move,
  Undo2,
  Redo2,
} from 'lucide-react';
import {
  DEFAULT_HEROES,
  PASTEL_PALETTE,
} from './data/defaultCatalog';
import { uploadImageFile } from './utils/cloudStorage';
import HeroSkinModal from './components/HeroSkinModal';
import PosterCanvas from './components/PosterCanvas';
import FloatingScratchpad from './components/FloatingScratchpad';
import { loadCatalogFromIndexedDB, saveCatalogToIndexedDB } from './utils/catalogStorage';

const CATALOG_STORAGE_KEY = 'rov_white_angel_catalog_v2';
const CATALOG_SKIN_MIGRATION_KEY = 'rov_white_angel_catalog_skins_cleared_v1';
const SAVED_POSTERS_KEY = 'rov_white_angel_saved_posters_v2';
const WORKSPACE_DRAFT_KEY = 'rov_white_angel_workspace_draft_v1';
const ALL_COLUMN_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

function loadWorkspaceDraft() {
  try {
    const raw = localStorage.getItem(WORKSPACE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const EXPORT_QUALITY_OPTIONS = [
  {
    id: 'sd',
    scale: 0.75,
    tileWidth: 248,
    tileHeight: 405,
    shortLabel: '0.75x ประหยัด',
    label: 'ประหยัด 0.75x (248×405 px)',
    badge: 'SD',
  },
  {
    id: 'standard',
    scale: 1,
    tileWidth: 330,
    tileHeight: 540,
    shortLabel: '1x มาตรฐาน',
    label: 'มาตรฐาน 1x (330×540 px)',
    badge: 'HD',
  },
  {
    id: 'high',
    scale: 1.5,
    tileWidth: 495,
    tileHeight: 810,
    shortLabel: '1.5x คมชัดสูง',
    label: 'คมชัดสูง 1.5x (495×810 px)',
    badge: 'FHD',
  },
  {
    id: 'ultra',
    scale: 2,
    tileWidth: 660,
    tileHeight: 1080,
    shortLabel: '2x ชัดสูงสุด',
    label: 'คมชัดสูงสุด 2x (660×1080 px)',
    badge: '4K',
  },
];

/**
 * Applies a subtle 3x3 unsharp convolution filter to make skin artwork and badges extra crisp.
 */
function applyCanvasSharpen(ctx, width, height, amount = 0.22) {
  if (!ctx || amount <= 0 || width * height > 24000000) return;
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src);
    const w = width;
    const h = height;
    const a = amount;
    const centerWeight = 1 + 4 * a;
    const neighborWeight = -a;

    for (let y = 1; y < h - 1; y++) {
      const rowOffset = y * w * 4;
      const prevRow = (y - 1) * w * 4;
      const nextRow = (y + 1) * w * 4;
      for (let x = 1; x < w - 1; x++) {
        const idx = rowOffset + x * 4;
        const left = idx - 4;
        const right = idx + 4;
        const up = prevRow + x * 4;
        const down = nextRow + x * 4;

        out[idx] =
          src[idx] * centerWeight +
          (src[left] + src[right] + src[up] + src[down]) * neighborWeight;
        out[idx + 1] =
          src[idx + 1] * centerWeight +
          (src[left + 1] + src[right + 1] + src[up + 1] + src[down + 1]) *
            neighborWeight;
        out[idx + 2] =
          src[idx + 2] * centerWeight +
          (src[left + 2] + src[right + 2] + src[up + 2] + src[down + 2]) *
            neighborWeight;
      }
    }
    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore if tainted or memory limit reached
  }
}

/**
 * คำนวณจำนวนรูปต่อแถวที่แนะนำ (1 - 20 รูป/แถว) จากจำนวนรูปที่เลือกทั้งหมด (count)
 * โดยเน้นจำนวนที่หารลงตัว (แถวเต็มพอดีไม่มีช่องว่าง) และสัดส่วนภาพรวมที่สมดุลสวยงาม
 */
function getRecommendedColumns(count) {
  if (!count || count <= 0) {
    return [{ cols: 10, rows: 1, exact: true, reason: 'ค่ามาตรฐานยอดนิยม' }];
  }
  if (count <= 20) {
    const exactDivisors = [];
    for (let c = 2; c <= 20; c++) {
      if (count % c === 0) {
        const rows = count / c;
        if (rows >= 1 && rows <= 10) {
          // ให้คะแนนสัดส่วนที่ใกล้เคียงแนวนอนสวยๆ (cols >= rows)
          const ratioScore = Math.abs(c / rows - 2.2);
          exactDivisors.push({
            cols: c,
            rows,
            exact: true,
            score: ratioScore,
            reason: rows === 1 ? `เรียงแถวเดียว ${c} รูป` : `ลงตัวพอดี ${rows} แถว`,
          });
        }
      }
    }
    exactDivisors.sort((a, b) => a.score - b.score);
    if (exactDivisors.length > 0) {
      return exactDivisors.slice(0, 4);
    }
  }

  const candidates = [];
  for (let c = 3; c <= 20; c++) {
    const rows = Math.ceil(count / c);
    const remainder = count % c;
    const isExact = remainder === 0;
    const emptySlots = isExact ? 0 : c - remainder;
    // สัดส่วนภาพรวมที่สวยงาม: จำนวนคอลัมน์เป็นประมาณ 1.5 - 3 เท่าของจำนวนแถว
    const idealCols = Math.round(Math.sqrt(count * 2.2));
    const distanceToIdeal = Math.abs(c - Math.min(20, Math.max(4, idealCols)));

    if (isExact) {
      candidates.push({
        cols: c,
        rows,
        exact: true,
        score: distanceToIdeal,
        reason: `ลงตัวพอดี ${rows} แถว (${c}×${rows})`,
      });
    } else if (emptySlots <= 2 && rows >= 2) {
      candidates.push({
        cols: c,
        rows,
        exact: false,
        score: distanceToIdeal + emptySlots * 3 + 5,
        reason: `${rows} แถว (แถวท้ายเหลือ ${remainder} รูป)`,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 4);
}

export function App() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isAdminSessionLoading, setIsAdminSessionLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (sessionStorage.getItem('rov_temp_admin_auth') === 'true') {
      setIsAdminAuthenticated(true);
      setIsAdminSessionLoading(false);
      return;
    }

    fetch('/api/admin/session', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setIsAdminAuthenticated(Boolean(data?.authenticated));
      })
      .catch(() => {
        if (!cancelled) setIsAdminAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setIsAdminSessionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Hero & Skin Catalog State
  const [heroes, setHeroes] = useState(() =>
    DEFAULT_HEROES.map((hero) => ({ ...hero, skins: [] }))
  );
  const [isCatalogLoaded, setIsCatalogLoaded] = useState(false);
  const [cloudCatalogReady, setCloudCatalogReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      try {
        const cloudResponse = await fetch('/api/admin/catalog', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!cloudResponse.ok) throw new Error('โหลดคลังจากคลาวด์ไม่สำเร็จ');
        const cloudData = await cloudResponse.json();

        if (Array.isArray(cloudData.catalog) && cloudData.catalog.length > 0) {
          await saveCatalogToIndexedDB(cloudData.catalog);
          if (!cancelled) {
            setHeroes(cloudData.catalog);
            setCloudCatalogReady(true);
          }
          return;
        }

        const indexedCatalog = await loadCatalogFromIndexedDB();
        let localCatalog =
          Array.isArray(indexedCatalog) && indexedCatalog.length
            ? indexedCatalog
            : null;
        let hasExistingCatalogData = Boolean(
          localCatalog?.some(
            (hero) =>
              (Array.isArray(hero.skins) && hero.skins.length > 0) ||
              !DEFAULT_HEROES.some(
                (defaultHero) =>
                  defaultHero.id === hero.id &&
                  defaultHero.name === hero.name &&
                  defaultHero.image === hero.image
              )
          )
        );

        if (!localCatalog) {
          let parsed = [];
          try {
            const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
            parsed = saved ? JSON.parse(saved) : [];
          } catch {
            parsed = [];
          }

          const shouldClearLegacySkins =
            localStorage.getItem(CATALOG_SKIN_MIGRATION_KEY) !== 'done';
          hasExistingCatalogData =
            Array.isArray(parsed) &&
            parsed.some(
              (hero) =>
                (Array.isArray(hero.skins) && hero.skins.length > 0) ||
                !DEFAULT_HEROES.some(
                  (defaultHero) =>
                    defaultHero.id === hero.id &&
                    defaultHero.name === hero.name &&
                    defaultHero.image === hero.image
                )
            );
          const source =
            Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_HEROES;
          const savedIds = new Set(source.map((hero) => hero.id));
          const newlyAddedDefaults = DEFAULT_HEROES.filter(
            (hero) => !savedIds.has(hero.id)
          );
          localCatalog = [
            ...source.map((hero) => ({
              ...hero,
              skins: shouldClearLegacySkins
                ? []
                : Array.isArray(hero.skins)
                  ? hero.skins
                  : [],
            })),
            ...newlyAddedDefaults.map((hero) => ({ ...hero, skins: [] })),
          ];
          await saveCatalogToIndexedDB(localCatalog);
          localStorage.setItem(CATALOG_SKIN_MIGRATION_KEY, 'done');
        }

        if (cancelled) return;
        setHeroes(localCatalog);

        if (
          isAdminAuthenticated &&
          hasExistingCatalogData &&
          localCatalog.length > 0
        ) {
          const bootstrapResponse = await fetch('/api/admin/catalog', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ catalog: localCatalog }),
          });
          if (bootstrapResponse.ok) {
            setCloudCatalogReady(true);
          } else if (bootstrapResponse.status === 409) {
            const latestResponse = await fetch('/api/admin/catalog', {
              cache: 'no-store',
            });
            const latest = await latestResponse.json();
            if (Array.isArray(latest.catalog)) {
              await saveCatalogToIndexedDB(latest.catalog);
              if (!cancelled) setHeroes(latest.catalog);
              setCloudCatalogReady(true);
            }
          }
        }
      } catch {
        try {
          const indexedCatalog = await loadCatalogFromIndexedDB();
          if (
            !cancelled &&
            Array.isArray(indexedCatalog) &&
            indexedCatalog.length
          ) {
            setHeroes(indexedCatalog);
          }
        } catch {
          // Use default catalog
        }
      } finally {
        if (!cancelled) setIsCatalogLoaded(true);
      }
    };

    setCloudCatalogReady(false);
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [isAdminAuthenticated]);

  useEffect(() => {
    if (!isCatalogLoaded) return;
    saveCatalogToIndexedDB(heroes).catch(() => {
      notify('บันทึกข้อมูลไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม กรุณาสำรองข้อมูล JSON');
    });
  }, [heroes, isCatalogLoaded]);

  useEffect(() => {
    if (!isCatalogLoaded || !cloudCatalogReady || !isAdminAuthenticated) return;
    const controller = new AbortController();
    fetch('/api/admin/catalog', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog: heroes }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Cloud catalog save failed');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          notify('บันทึกคลังกลางไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ');
        }
      });
    return () => controller.abort();
  }, [heroes, isCatalogLoaded, cloudCatalogReady, isAdminAuthenticated]);

  const heroesById = useMemo(() => {
    const map = {};
    heroes.forEach((h) => {
      map[h.id] = h;
    });
    return map;
  }, [heroes]);

  // 2. Navigation & Step State (Restored from saved draft if present)
  const [step, setStep] = useState(() => {
    const draft = loadWorkspaceDraft();
    if (draft?.step && [1, 2, 3, 4].includes(Number(draft.step))) {
      return Number(draft.step);
    }
    if (Array.isArray(draft?.selectedSkins) && draft.selectedSkins.length > 0) {
      return 2;
    }
    return 1;
  });
  const [activeHeroId, setActiveHeroId] = useState(
    () => heroes[0]?.id || 'alice'
  );
  const activeHero = useMemo(
    () => heroes.find((h) => h.id === activeHeroId) || heroes[0],
    [heroes, activeHeroId]
  );

  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // 3. Selected Skin Queue + Undo / Redo History Stack
  const [selectedSkins, setSelectedSkins] = useState(() => {
    const draft = loadWorkspaceDraft();
    return Array.isArray(draft?.selectedSkins) ? draft.selectedSkins : [];
  });
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const commitSelectedSkins = (updater) => {
    setSelectedSkins((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      setUndoStack((stack) => [...stack.slice(-39), prev]);
      setRedoStack([]);
      return next;
    });
  };

  const handleUndo = () => {
    if (!undoStack.length) return;
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((rStack) => [...rStack.slice(-39), selectedSkins]);
    setSelectedSkins(previousState);
    setSelectedArrangeIdx(null);
    notify('ย้อนกลับ (Undo) เรียบร้อย');
  };

  const handleRedo = () => {
    if (!redoStack.length) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack((rStack) => rStack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-39), selectedSkins]);
    setSelectedSkins(nextState);
    setSelectedArrangeIdx(null);
    notify('ทำซ้ำ (Redo) เรียบร้อย');
  };

  useEffect(() => {
    setSelectedSkins((prev) =>
      prev.map((item) => {
        const h = heroesById[item.heroId];
        const s = h?.skins.find((sk) => sk.id === item.skinId);
        if (!h || !s) return item;
        return {
          ...item,
          heroName: h.name,
          name: s.name,
          image: s.image || item.image || '',
        };
      })
    );
  }, [heroes, heroesById]);

  // 4. Search & Filters
  const [heroQuery, setHeroQuery] = useState('');
  const [skinQuery, setSkinQuery] = useState('');
  const [showAllHeroesSkins, setShowAllHeroesSkins] = useState(false);
  // Null = show Hero Categories list; Hero ID = drilled into that Hero's skins
  const [pickerHeroId, setPickerHeroId] = useState(null);
  const [isMobilePickerCollapsed, setIsMobilePickerCollapsed] = useState(false);
  const [hideBoardBadges, setHideBoardBadges] = useState(false);

  const pickerHero = useMemo(
    () => (pickerHeroId ? heroesById[pickerHeroId] || null : null),
    [pickerHeroId, heroesById]
  );

  const [quickSkinName, setQuickSkinName] = useState('');
  const [quickSkinImage, setQuickSkinImage] = useState('');

  // 5. Grid Layout State (1 to 20 columns, odd or even) & Export Quality
  const [layout, setLayout] = useState(() => {
    const draft = loadWorkspaceDraft();
    const savedCols = Number(draft?.columns);
    return {
      columns:
        savedCols >= 1 && savedCols <= 20 ? Math.round(savedCols) : 6,
    };
  });
  const [exportQualityId, setExportQualityId] = useState(() => {
    const draft = loadWorkspaceDraft();
    return EXPORT_QUALITY_OPTIONS.some((o) => o.id === draft?.exportQualityId)
      ? draft.exportQualityId
      : 'standard';
  });
  const [sharpenExport, setSharpenExport] = useState(() => {
    const draft = loadWorkspaceDraft();
    return typeof draft?.sharpenExport === 'boolean'
      ? draft.sharpenExport
      : true;
  });

  // Persist workspace draft (selectedSkins, columns, step, exportQualityId, sharpenExport) across refreshes
  useEffect(() => {
    try {
      const fullPayload = {
        step,
        columns: layout?.columns || 6,
        exportQualityId,
        sharpenExport,
        selectedSkins,
      };
      localStorage.setItem(WORKSPACE_DRAFT_KEY, JSON.stringify(fullPayload));
    } catch {
      try {
        // Fallback if base64 images exceed localStorage quota: store lightweight refs & rehydrate from IndexedDB/Cloud catalog
        const compactPayload = {
          step,
          columns: layout?.columns || 6,
          exportQualityId,
          sharpenExport,
          selectedSkins: selectedSkins.map((item) => ({
            uid: item.uid,
            heroId: item.heroId,
            heroName: item.heroName,
            skinId: item.skinId,
            name: item.name,
            image:
              item.image && !item.image.startsWith('data:') ? item.image : '',
          })),
        };
        localStorage.setItem(
          WORKSPACE_DRAFT_KEY,
          JSON.stringify(compactPayload)
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, [step, layout?.columns, exportQualityId, sharpenExport, selectedSkins]);

  // Keyboard shortcuts for Undo (Ctrl+Z / Cmd+Z) and Redo (Ctrl+Y / Cmd+Shift+Z)
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (redoStack.length > 0) {
            e.preventDefault();
            handleRedo();
          }
        } else if (undoStack.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (redoStack.length > 0) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const currentQualityOption = useMemo(
    () =>
      EXPORT_QUALITY_OPTIONS.find((opt) => opt.id === exportQualityId) ||
      EXPORT_QUALITY_OPTIONS[1],
    [exportQualityId]
  );

  const exportDimensionsInfo = useMemo(() => {
    const count = Math.max(1, selectedSkins.length);
    const cols = Math.max(1, Math.min(20, Number(layout?.columns) || 6));
    const actualCols = Math.min(cols, count);
    const rows = Math.ceil(count / cols);
    const tileW = currentQualityOption.tileWidth;
    const tileH = currentQualityOption.tileHeight;
    return {
      tileWidth: tileW,
      tileHeight: tileH,
      totalWidth: actualCols * tileW,
      totalHeight: rows * tileH,
      actualCols,
      rows,
    };
  }, [selectedSkins.length, layout?.columns, currentQualityOption]);

  // Smart Column Recommendations based on selectedSkins.length
  const recommendedColsList = useMemo(
    () => getRecommendedColumns(selectedSkins.length),
    [selectedSkins.length]
  );

  // Saved Collections
  const [savedPosters, setSavedPosters] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_POSTERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_POSTERS_KEY, JSON.stringify(savedPosters));
    } catch {
      // Ignore storage errors
    }
  }, [savedPosters]);

  const [favorite, setFavorite] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Reordering states (Unified Pointer Drag + Floating Ghost + Tap-to-Swap)
  const [dragIndex, setDragIndex] = useState(null);
  const [selectedArrangeIdx, setSelectedArrangeIdx] = useState(null);
  const [dragGhost, setDragGhost] = useState(null);
  const touchDragIdxRef = useRef(null);
  const pointerDragRef = useRef(null);
  const floatingGhostRef = useRef(null);

  const previewRef = useRef(null);

  const notify = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2800);
  };

  // --- Catalog CRUD Handlers ---
  const handleUpdateHero = (heroId, patch) => {
    setHeroes((prev) =>
      prev.map((h) => (h.id === heroId ? { ...h, ...patch } : h))
    );
  };

  const handleAddHero = ({ name, title, image, color }) => {
    const id =
      name.toLowerCase().replace(/[^a-z0-9]/g, '-') +
      '-' +
      Date.now().toString().slice(-4);
    const newHero = {
      id,
      name,
      title,
      image,
      color,
      skins: [],
    };
    setHeroes((prev) => [newHero, ...prev]);
    setActiveHeroId(id);
    return newHero;
  };

  const handleDeleteHero = (heroId) => {
    setHeroes((prev) => {
      const filtered = prev.filter((h) => h.id !== heroId);
      if (activeHeroId === heroId && filtered.length > 0) {
        setActiveHeroId(filtered[0].id);
      }
      return filtered;
    });
    setSelectedSkins((prev) => prev.filter((item) => item.heroId !== heroId));
    notify('ลบฮีโร่ออกจากรายการแล้ว');
  };

  const handleAddSkin = (heroId, { name, image }) => {
    const skinId = `${heroId}-skin-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const newSkin = { id: skinId, name, image: image || '' };
    setHeroes((prev) =>
      prev.map((h) =>
        h.id === heroId ? { ...h, skins: [newSkin, ...h.skins] } : h
      )
    );
    return newSkin;
  };

  const handleUpdateSkin = (heroId, skinId, patch) => {
    setHeroes((prev) =>
      prev.map((h) =>
        h.id === heroId
          ? {
              ...h,
              skins: h.skins.map((s) =>
                s.id === skinId ? { ...s, ...patch } : s
              ),
            }
          : h
      )
    );
  };

  const handleDeleteSkin = (heroId, skinId) => {
    setHeroes((prev) =>
      prev.map((h) =>
        h.id === heroId
          ? { ...h, skins: h.skins.filter((s) => s.id !== skinId) }
          : h
      )
    );
    const uid = `${heroId}__${skinId}`;
    setSelectedSkins((prev) => prev.filter((item) => item.uid !== uid));
  };

  const handleResetCatalog = () => {
    setHeroes(DEFAULT_HEROES.map((hero) => ({ ...hero, skins: [] })));
    setActiveHeroId(DEFAULT_HEROES[0].id);
    setSelectedSkins([]);
    notify('รีเซ็ตข้อมูลฮีโร่และสกินกลับเป็นค่าเริ่มต้นแล้ว');
  };

  const handleExportCatalog = () => {
    const blob = new Blob([JSON.stringify(heroes, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rov-heroes-skins-catalog.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('ดาวน์โหลดไฟล์สำรองฐานข้อมูลฮีโร่ (.json) แล้ว');
  };

  const handleImportCatalog = (importedHeroes) => {
    const importedCatalog = importedHeroes.map((hero) => ({
      ...hero,
      skins: Array.isArray(hero.skins) ? hero.skins : [],
    }));
    setHeroes(importedCatalog);
    setSelectedSkins([]);
    if (importedCatalog[0]?.id) setActiveHeroId(importedCatalog[0].id);
  };

  const handleInlineHeroImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeHero) return;
    try {
      const imageUrl = await uploadImageFile(file, 'heroes');
      handleUpdateHero(activeHero.id, { image: imageUrl });
      notify(`อัปโหลดรูปภาพฮีโร่ ${activeHero.name} สำเร็จ!`);
    } catch (error) {
      notify(error.message || 'ไม่สามารถอัปโหลดรูปภาพได้');
    }
    e.target.value = '';
  };

  const handleQuickSkinImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await uploadImageFile(file, 'skins');
      setQuickSkinImage(imageUrl);
      notify('เตรียมรูปสกินใหม่เรียบร้อย กดปุ่ม "+ เพิ่มสกิน" ได้เลย');
    } catch (error) {
      notify(error.message || 'ไม่สามารถอัปโหลดรูปภาพสกินได้');
    }
    e.target.value = '';
  };

  const handleQuickAddSkinSubmit = (e) => {
    e.preventDefault();
    if (!activeHero) return;
    const created = handleAddSkin(activeHero.id, {
      name:
        quickSkinName.trim() || `Skin ${(activeHero.skins?.length || 0) + 1}`,
      image: quickSkinImage.trim(),
    });
    const uid = `${activeHero.id}__${created.id}__${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    commitSelectedSkins((prev) => [
      ...prev,
      {
        uid,
        heroId: activeHero.id,
        heroName: activeHero.name,
        skinId: created.id,
        name: created.name,
        image: created.image || '',
      },
    ]);
    setQuickSkinName('');
    setQuickSkinImage('');
    notify(`เพิ่มรูปสกินของ ${activeHero.name} และเลือกเข้าคอลเลกชันแล้ว`);
  };

  // --- Skin Selection & Sorting Handlers (Supports Duplicate Skins) ---
  const getSkinSelectedCount = (heroId, skinId) => {
    return selectedSkins.filter(
      (item) => item.heroId === heroId && item.skinId === skinId
    ).length;
  };

  const isSkinSelected = (heroId, skinId) => {
    return getSkinSelectedCount(heroId, skinId) > 0;
  };

  // Clicking a skin always adds a new instance (allowing duplicate skins like sortskin.com/generate/rov)
  const addSkinSelection = (heroObj, skinObj) => {
    const uid = `${heroObj.id}__${skinObj.id}__${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    commitSelectedSkins((prev) => [
      ...prev,
      {
        uid,
        heroId: heroObj.id,
        heroName: heroObj.name,
        skinId: skinObj.id,
        name: skinObj.name,
        image: skinObj.image || '',
      },
    ]);
  };

  // Remove the most recently added instance of a specific (heroId, skinId)
  const removeOneSkinInstance = (heroId, skinId) => {
    commitSelectedSkins((prev) => {
      const lastIdx = prev
        .map((item) => item.heroId === heroId && item.skinId === skinId)
        .lastIndexOf(true);
      if (lastIdx === -1) return prev;
      const copy = [...prev];
      copy.splice(lastIdx, 1);
      return copy;
    });
    setSelectedArrangeIdx(null);
  };

  // Duplicate an already-selected skin right at its current position in the queue
  const duplicateSkinAtIndex = (idx) => {
    commitSelectedSkins((prev) => {
      if (idx === null || idx < 0 || idx >= prev.length) return prev;
      const target = prev[idx];
      const duplicateItem = {
        ...target,
        uid: `${target.heroId}__${target.skinId}__${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`,
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, duplicateItem);
      return copy;
    });
    notify('คัดลอกสกินซ้ำเพิ่มอีก 1 รูปเรียบร้อย');
  };

  const clearAllSelectedSkins = () => {
    commitSelectedSkins([]);
    setSelectedArrangeIdx(null);
    notify('ล้างรายการสกินที่เลือกทั้งหมดแล้ว (กด ↶ ย้อนกลับได้)');
  };

  const moveSelectedSkin = (idx, dir) => {
    commitSelectedSkins((prev) => {
      const arr = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return prev;
      [arr[idx], arr[to]] = [arr[to], arr[idx]];
      return arr;
    });
    setSelectedArrangeIdx((prev) => {
      if (prev === null) return null;
      const to = idx + dir;
      if (to < 0 || to >= selectedSkins.length) return prev;
      return to;
    });
  };

  const moveSkinToIndex = (fromIdx, toIdx) => {
    if (
      fromIdx === null ||
      toIdx === null ||
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0
    ) {
      return;
    }
    commitSelectedSkins((prev) => {
      if (fromIdx >= prev.length || toIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
    setSelectedArrangeIdx(toIdx);
  };

  const swapSkinPositions = (idxA, idxB) => {
    if (idxA === null || idxB === null || idxA === idxB) return;
    commitSelectedSkins((prev) => {
      if (idxA >= prev.length || idxB >= prev.length) return prev;
      const copy = [...prev];
      [copy[idxA], copy[idxB]] = [copy[idxB], copy[idxA]];
      return copy;
    });
    setSelectedArrangeIdx(null);
    notify(`สลับตำแหน่งรูปที่ #${idxA + 1} กับ #${idxB + 1} เรียบร้อย`);
  };

  const sortSkinsByHero = () => {
    commitSelectedSkins((prev) =>
      [...prev].sort((a, b) => a.heroName.localeCompare(b.heroName))
    );
    setSelectedArrangeIdx(null);
    notify('จัดเรียงรูปสกินแยกตามชื่อฮีโร่ (A → Z) เรียบร้อย!');
  };

  const reverseSkinsOrder = () => {
    commitSelectedSkins((prev) => [...prev].reverse());
    setSelectedArrangeIdx(null);
    notify('สลับลำดับรูปสกินหน้า-หลังเรียบร้อย');
  };

  // Desktop HTML5 Drag and Drop (fallback)
  const handleDragStart = (idx) => {
    setDragIndex(idx);
    setSelectedArrangeIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    commitSelectedSkins((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(idx, 0, moved);
      return copy;
    });
    setDragIndex(idx);
    setSelectedArrangeIdx(idx);
  };

  const handleDragEnd = () => setDragIndex(null);

  // Unified 60fps/120fps Pointer Drag-and-Drop (Works on iPad Touch, Apple Pencil, Mobile & Desktop)
  const handleTilePointerDown = (e, idx, item, imgSrc, bg) => {
    // Ignore right-click or clicks on the delete button
    if (e.button && e.button !== 0) return;
    if (e.target?.closest?.('button')) return;

    const tileEl = e.currentTarget;
    const rect = tileEl.getBoundingClientRect();
    try {
      tileEl.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore pointer capture errors
    }

    pointerDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: Math.max(48, Math.min(180, rect.width)),
      height: Math.max(72, Math.min(270, rect.height)),
      currentIdx: idx,
      isDragging: false,
      hasRecordedUndo: false,
      initialSkins: selectedSkins,
      lastSwapTime: 0,
      item,
      imgSrc,
      bg,
    };
  };

  const handleTilePointerMove = (e) => {
    const state = pointerDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (!state.isDragging) {
      if (Math.hypot(dx, dy) < 5) return;
      state.isDragging = true;
      setDragIndex(state.currentIdx);
      setSelectedArrangeIdx(null);
      setDragGhost({
        imgSrc: state.imgSrc,
        bg: state.bg,
        name: state.item?.name || '',
        index: state.currentIdx,
        width: state.width,
        height: state.height,
        x: e.clientX - state.offsetX,
        y: e.clientY - state.offsetY,
      });
    }

    // Direct hardware-accelerated DOM transform update (0ms latency on iPad ProMotion)
    if (floatingGhostRef.current) {
      const gx = e.clientX - state.offsetX;
      const gy = e.clientY - state.offsetY;
      floatingGhostRef.current.style.transform = `translate3d(${gx}px, ${gy}px, 0) scale(1.06) rotate(-1.5deg)`;
    }

    // Smooth auto-scroll when dragging near top or bottom of iPad viewport
    if (e.clientY < 65) {
      window.scrollBy({ top: -9, behavior: 'auto' });
    } else if (e.clientY > window.innerHeight - 65) {
      window.scrollBy({ top: 9, behavior: 'auto' });
    }

    const now = performance.now();
    if (now - state.lastSwapTime < 45) return;

    const elem = document.elementFromPoint(e.clientX, e.clientY);
    const overTile = elem?.closest?.('[data-arrange-index]');
    if (!overTile) return;

    const overIdx = Number(overTile.getAttribute('data-arrange-index'));
    if (
      !Number.isNaN(overIdx) &&
      overIdx >= 0 &&
      overIdx !== state.currentIdx
    ) {
      // Check that the finger is reasonably inside the target tile to prevent border jitter
      const overRect = overTile.getBoundingClientRect();
      const marginX = overRect.width * 0.12;
      const marginY = overRect.height * 0.12;
      const insideCore =
        e.clientX >= overRect.left + marginX &&
        e.clientX <= overRect.right - marginX &&
        e.clientY >= overRect.top + marginY &&
        e.clientY <= overRect.bottom - marginY;

      if (!insideCore) return;

      if (!state.hasRecordedUndo && state.initialSkins) {
        state.hasRecordedUndo = true;
        setUndoStack((stack) => [...stack.slice(-39), state.initialSkins]);
        setRedoStack([]);
      }

      const fromIdx = state.currentIdx;
      setSelectedSkins((prev) => {
        if (fromIdx >= prev.length || overIdx >= prev.length) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(overIdx, 0, moved);
        return copy;
      });
      state.currentIdx = overIdx;
      state.lastSwapTime = now;
      setDragIndex(overIdx);
      setDragGhost((prev) => (prev ? { ...prev, index: overIdx } : null));
    }
  };

  const handleTilePointerUp = (e) => {
    const state = pointerDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore release errors
    }

    const wasDragging = state.isDragging;
    const tappedIdx = state.currentIdx;

    pointerDragRef.current = null;
    setDragIndex(null);
    setDragGhost(null);

    if (!wasDragging) {
      handleTileTap(tappedIdx);
    }
  };

  // Mobile Touch Drag-and-Drop fallback
  const handleTouchDragStart = (idx) => {
    touchDragIdxRef.current = idx;
    setDragIndex(idx);
    setSelectedArrangeIdx(idx);
  };

  const handleTouchDragMove = (e) => {
    if (touchDragIdxRef.current === null) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const tileEl = elem?.closest?.('[data-arrange-index]');
    if (!tileEl) return;
    const overIdx = Number(tileEl.getAttribute('data-arrange-index'));
    if (
      !Number.isNaN(overIdx) &&
      overIdx >= 0 &&
      overIdx !== touchDragIdxRef.current
    ) {
      const fromIdx = touchDragIdxRef.current;
      setSelectedSkins((prev) => {
        if (fromIdx >= prev.length || overIdx >= prev.length) return prev;
        const copy = [...prev];
        const [moved] = copy.splice(fromIdx, 1);
        copy.splice(overIdx, 0, moved);
        return copy;
      });
      touchDragIdxRef.current = overIdx;
      setDragIndex(overIdx);
      setSelectedArrangeIdx(overIdx);
    }
  };

  const handleTouchDragEnd = () => {
    touchDragIdxRef.current = null;
    setDragIndex(null);
  };

  // Tap-to-Swap handler (Works effortlessly on mobile & desktop)
  const handleTileTap = (idx) => {
    if (selectedArrangeIdx === null) {
      setSelectedArrangeIdx(idx);
    } else if (selectedArrangeIdx === idx) {
      setSelectedArrangeIdx(null);
    } else {
      swapSkinPositions(selectedArrangeIdx, idx);
    }
  };

  const filteredHeroes = useMemo(() => {
    return heroes
      .filter(
        (h) =>
          h.name.toLowerCase().includes(heroQuery.toLowerCase()) ||
          (h.title || '').toLowerCase().includes(heroQuery.toLowerCase())
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
      );
  }, [heroes, heroQuery]);

  const displayedSkinEntries = useMemo(() => {
    const sourceHeroes = showAllHeroesSkins
      ? heroes
      : activeHero
        ? [activeHero]
        : [];
    const list = [];
    sourceHeroes.forEach((h) => {
      h.skins.forEach((s) => {
        const matchesQuery =
          s.name.toLowerCase().includes(skinQuery.toLowerCase()) ||
          h.name.toLowerCase().includes(skinQuery.toLowerCase());
        if (matchesQuery) {
          list.push({ hero: h, skin: s });
        }
      });
    });
    return list;
  }, [heroes, activeHero, showAllHeroesSkins, skinQuery]);

  // Capture a quick snapshot of the current board to store in the Floating Scratchpad
  const handleCaptureBoardToScratchpad = async () => {
    if (!selectedSkins.length) {
      throw new Error('ยังไม่มีรูปสกินในตาราง');
    }
    const cols = Math.max(1, Math.min(20, Number(layout?.columns) || 6));
    const actualCols = Math.min(cols, selectedSkins.length);
    const rows = Math.ceil(selectedSkins.length / cols);

    // Use a balanced tile resolution so multiple snapshots fit comfortably in localStorage
    let tileWidth = 220;
    let tileHeight = 360;
    const maxDim = 2400;
    if (actualCols * tileWidth > maxDim || rows * tileHeight > maxDim) {
      const scale = Math.min(
        maxDim / (actualCols * tileWidth),
        maxDim / (rows * tileHeight)
      );
      tileWidth = Math.max(88, Math.floor(tileWidth * scale));
      tileHeight = Math.max(144, Math.round((tileWidth * 540) / 330));
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, actualCols * tileWidth);
    canvas.height = Math.max(1, rows * tileHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('ไม่สามารถเตรียมพื้นที่สร้างภาพได้');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let i = 0; i < selectedSkins.length; i++) {
      const item = selectedSkins[i];
      const heroObj = heroesById[item.heroId];
      const imgSrc = item.image || heroObj?.image || '';
      const colIdx = i % cols;
      const rowIdx = Math.floor(i / cols);
      const left = colIdx * tileWidth;
      const top = rowIdx * tileHeight;

      ctx.fillStyle =
        heroObj?.color || PASTEL_PALETTE[i % PASTEL_PALETTE.length] || '#ffffff';
      ctx.fillRect(left, top, tileWidth, tileHeight);

      if (!imgSrc) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = imgSrc;
      });
      if (!img.naturalWidth || !img.naturalHeight) continue;

      const sourceRatio = img.naturalWidth / img.naturalHeight;
      const targetRatio = tileWidth / tileHeight;
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;

      if (sourceRatio > targetRatio) {
        sw = img.naturalHeight * targetRatio;
        sx = (img.naturalWidth - sw) / 2;
      } else {
        sh = img.naturalWidth / targetRatio;
        sy = (img.naturalHeight - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, left, top, tileWidth, tileHeight);
    }

    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.88),
      count: selectedSkins.length,
      title: `ตาราง ${selectedSkins.length} สกิน (${cols} รูป/แถว)`,
    };
  };

  // Render the collage directly to a pixel-aligned canvas.
  const handleDownloadPng = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    try {
      const preview = previewRef.current;
      const tiles = Array.from(preview.querySelectorAll('.seamlessSkinTile'));
      if (!tiles.length) throw new Error('ยังไม่มีรูปสกินในตาราง');

      const cols = Math.max(1, Math.min(20, Number(layout?.columns) || 6));
      const actualCols = Math.min(cols, tiles.length);
      const rows = Math.ceil(tiles.length / cols);

      // Base dimensions from selected quality preset (maintains 330:540 / 11:18 ratio)
      let tileWidth = currentQualityOption.tileWidth;
      let tileHeight = currentQualityOption.tileHeight;

      // Guard against browser canvas max dimension limits (e.g. 16384px)
      const maxCanvasDim = 16000;
      if (
        actualCols * tileWidth > maxCanvasDim ||
        rows * tileHeight > maxCanvasDim
      ) {
        const downscale = Math.min(
          maxCanvasDim / (actualCols * tileWidth),
          maxCanvasDim / (rows * tileHeight)
        );
        tileWidth = Math.max(110, Math.floor(tileWidth * downscale));
        tileHeight = Math.max(180, Math.round((tileWidth * 540) / 330));
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, actualCols * tileWidth);
      canvas.height = Math.max(1, rows * tileHeight);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('ไม่สามารถเตรียมพื้นที่สร้างภาพได้');

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const colIdx = i % cols;
        const rowIdx = Math.floor(i / cols);
        const left = colIdx * tileWidth;
        const top = rowIdx * tileHeight;
        const width = tileWidth;
        const height = tileHeight;
        const background = getComputedStyle(tile).backgroundColor;

        context.fillStyle =
          background && background !== 'rgba(0, 0, 0, 0)'
            ? background
            : '#ffffff';
        context.fillRect(left, top, width, height);

        const img = tile.querySelector('img');
        if (!img) continue;
        if (!img.complete) {
          await new Promise((resolve, reject) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener(
              'error',
              () => reject(new Error('โหลดรูปสกินบางรูปไม่สำเร็จ')),
              { once: true }
            );
          });
        }
        if (!img.naturalWidth || !img.naturalHeight) {
          throw new Error('โหลดรูปสกินบางรูปไม่สำเร็จ');
        }
        if (typeof img.decode === 'function') await img.decode();

        const sourceRatio = img.naturalWidth / img.naturalHeight;
        const targetRatio = width / height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = img.naturalWidth;
        let sourceHeight = img.naturalHeight;

        if (sourceRatio > targetRatio) {
          sourceWidth = img.naturalHeight * targetRatio;
          sourceX = (img.naturalWidth - sourceWidth) / 2;
        } else {
          sourceHeight = img.naturalWidth / targetRatio;
          sourceY = (img.naturalHeight - sourceHeight) / 2;
        }

        context.drawImage(
          img,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          left,
          top,
          width,
          height
        );
      }

      if (sharpenExport) {
        applyCanvasSharpen(context, canvas.width, canvas.height, 0.2);
      }

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });
      if (!blob) throw new Error('ไม่สามารถสร้างไฟล์ PNG ได้');

      const filename = `rov-skin-collection-${selectedSkins.length}skins-${layout.columns}cols-${canvas.width}x${canvas.height}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: 'RoV Skin Collection' });
          notify('ส่งภาพไปยังเมนูแชร์เรียบร้อยแล้ว เลือก Save Image เพื่อบันทึก');
          return;
        } catch (shareError) {
          if (shareError?.name === 'AbortError') return;
        }
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      notify('สร้างไฟล์ PNG แล้ว หากไม่เริ่มดาวน์โหลด กรุณาเปิดไฟล์จากรายการดาวน์โหลด');
    } catch (error) {
      console.error('PNG export failed:', error);
      notify(error.message || 'เกิดข้อผิดพลาดในการสร้างไฟล์ภาพ กรุณาลองอีกครั้ง');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToCollection = () => {
    const entry = {
      id: 'poster-' + Date.now(),
      savedAt: new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      layout: { ...layout },
      selectedSkins: [...selectedSkins],
    };
    const next = [entry, ...savedPosters];
    setSavedPosters(next);
    notify('บันทึกคอลเลกชันนี้ไว้ในรายการที่บันทึกแล้ว ♡');
  };

  const handleLoadSavedPoster = (entry) => {
    if (entry.layout) setLayout(entry.layout);
    if (Array.isArray(entry.selectedSkins)) {
      setSelectedSkins(entry.selectedSkins);
    }
    setStep(4);
    notify('โหลดคอลเลกชันที่บันทึกไว้เรียบร้อยแล้ว');
  };

  const handleDeleteSavedPoster = (id) => {
    setSavedPosters((prev) => prev.filter((p) => p.id !== id));
  };

  if (isAdminSessionLoading) {
    return <div className="adminGateLoading">กำลังตรวจสอบสิทธิ์แอดมิน...</div>;
  }

  if (!isAdminAuthenticated) {
    return <AdminLogin onAuthenticated={() => setIsAdminAuthenticated(true)} />;
  }

  const activeArrangeItem =
    selectedArrangeIdx !== null ? selectedSkins[selectedArrangeIdx] : null;

  return (
    <main className="app">

      {toastMsg && (
        <div className="floatingToast">
          <Sparkles size={15} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 60fps/120fps Floating Drag Ghost Card for iPad / Mobile / Desktop */}
      {dragGhost && (
        <div
          ref={floatingGhostRef}
          className="floatingDragGhostCard"
          style={{
            width: `${dragGhost.width}px`,
            height: `${dragGhost.height}px`,
            background: dragGhost.bg || '#f5d9ea',
            transform: `translate3d(${dragGhost.x}px, ${dragGhost.y}px, 0) scale(1.06) rotate(-1.5deg)`,
          }}
        >
          {dragGhost.imgSrc && (
            <img
              src={dragGhost.imgSrc}
              alt=""
              referrerPolicy="no-referrer"
              draggable={false}
            />
          )}
          <div className="boardTileNumBadge tabular">
            {dragGhost.index + 1}
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="topbar">
        <div
          className="brand"
          onClick={() => setStep(1)}
          style={{ cursor: 'pointer' }}
        >
          <span className="brandmark">✧</span>
          <div>
            <b>RoV</b>
            <small>SKIN COLLECTION</small>
          </div>
        </div>

        <nav>
          <button
            className={step === 1 ? 'active' : ''}
            onClick={() => setStep(1)}
          >
            1. ฮีโร่ & รูปภาพ
          </button>
          <button
            className={step === 2 ? 'active' : ''}
            onClick={() => setStep(2)}
          >
            2. เลือกสกิน ({selectedSkins.length})
          </button>
          <button
            className={step === 3 ? 'active' : ''}
            onClick={() => setStep(3)}
          >
            3. จัดเรียงรูปสกิน
          </button>
          <button
            className={step === 4 ? 'active' : ''}
            onClick={() => setStep(4)}
          >
            4. พรีวิว & ดาวน์โหลด
          </button>
          <button
            className="navManageBtn"
            onClick={() => setIsManagerOpen(true)}
          >
            <ImageIcon size={13} /> คลังรูปฮีโร่/สกิน
          </button>
        </nav>

        <button
          className={favorite ? 'heart on' : 'heart'}
          onClick={() => setFavorite(!favorite)}
          aria-label="Favorite"
        >
          <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </header>

      {/* Hero Banner */}
      <section className="heroBanner">
        <div className="bannerCopy">
          <span className="eyebrow">COLLECT · ARRANGE · SEAMLESS GRID</span>
          <h1>
            RoV Skin
            <br />
            <i>Collection Grid</i>
          </h1>
          <p>
            เลือกรูปสกินที่ต้องการแล้วนำมาเรียงต่อกันเป็นตารางคอลเลกชันแบบไร้ขอบ
            <br />
            รองรับ 1–20 รูปต่อแถว พร้อมระบบแนะนำจำนวนรูปต่อแถวอัตโนมัติ ♡
          </p>
          <div className="bannerBtnGroup">
            <button className="primary" onClick={() => setStep(2)}>
              เริ่มเลือกสกินเลย <ArrowRight size={16} />
            </button>
            <button
              className="secondary"
              onClick={() => setIsManagerOpen(true)}
            >
              <Upload size={15} /> จัดการรูปภาพฮีโร่ & สกินทั้งหมด
            </button>
          </div>
        </div>

        <div className="bannerArt">
          <div className="halo">✧</div>
          <div className="artCard">
            ♡
            <span>
              SKIN
              <br />
              COLLECTION
            </span>
          </div>
          <div className="spark s1">✦</div>
          <div className="spark s2">✧</div>
        </div>
      </section>

      {/* Main Workspace */}
      <section className="workspace">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">SEAMLESS SKIN COLLAGE</span>
            <h2>
              จัดเรียงรูปสกินโชว์คอลเลกชัน <Sparkles size={20} />
            </h2>
          </div>

          <div className="steps">
            {[
              { n: 1, label: 'เลือกฮีโร่/ใส่รูป' },
              { n: 2, label: 'เลือกสกิน' },
              { n: 3, label: 'จัดเรียงลำดับรูป' },
              { n: 4, label: 'พรีวิว/ดาวน์โหลด' },
            ].map((item) => (
              <button
                key={item.n}
                className={step === item.n ? 'current' : ''}
                onClick={() => setStep(item.n)}
                title={item.label}
              >
                {item.n}
              </button>
            ))}
          </div>
        </div>

        {/* ============================================================
            STEP 1: SELECT HERO & DIRECT HERO IMAGE / DATA INPUT PANEL
           ============================================================ */}
        {step === 1 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 1 · เลือกฮีโร่ & ใส่ข้อมูลรูปภาพฮีโร่{' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  คลิกเลือกฮีโร่เพื่อใส่รูปภาพประจำตัวฮีโร่ เพิ่มรูปสกิน หรือกดเลือกสกินเข้าคอลเลกชัน
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setIsManagerOpen(true)}
              >
                <Plus size={15} /> เพิ่มฮีโร่ใหม่ / เปิดคลังข้อมูลทั้งหมด
              </button>
            </div>

            <div className="filterBarRow">
              <div className="search flex1">
                <Search size={17} />
                <input
                  placeholder="ค้นหาชื่อฮีโร่ (เช่น Alice, Violet, Lauriel, Allain)..."
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="heroGrid">
              {filteredHeroes.map((h, i) => {
                const isCurrent = activeHero?.id === h.id;
                const selectedCountForHero = selectedSkins.filter(
                  (item) => item.heroId === h.id
                ).length;

                return (
                  <div
                    className={'heroTile ' + (isCurrent ? 'chosen' : '')}
                    key={h.id}
                    onClick={() => setActiveHeroId(h.id)}
                  >
                    <div
                      className="tileArt"
                      style={{
                        background:
                          h.color || PASTEL_PALETTE[i % PASTEL_PALETTE.length],
                      }}
                    >
                      {h.image ? (
                        <img
                          src={h.image}
                          alt={h.name}
                          className="tileHeroImg"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{h.name.slice(0, 1)}</span>
                      )}
                      <Sparkles size={14} />
                      {selectedCountForHero > 0 && (
                        <span className="heroSelectedBadge tabular">
                          {selectedCountForHero} สกิน
                        </span>
                      )}
                    </div>
                    <div className="heroTileFooter">
                      <b>{h.name}</b>
                      <small>{h.skins.length} สกิน</small>
                    </div>
                  </div>
                );
              })}
            </div>

            {activeHero && (
              <div className="heroInlineEditorCard">
                <div className="heroInlineHeader">
                  <div>
                    <span className="eyebrow">HERO IMAGE & SKIN DATA INPUT</span>
                    <h4>
                      <Edit3 size={16} /> ช่องใส่ข้อมูลและรูปภาพของฮีโร่:{' '}
                      <b>{activeHero.name}</b>
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setIsManagerOpen(true)}
                  >
                    จัดการรูปสกินของ {activeHero.name} ทั้งหมด (
                    {activeHero.skins.length})
                  </button>
                </div>

                <div className="heroInlineBody">
                  <div className="heroInlineAvatarCol">
                    <div
                      className="heroInlinePreview"
                      style={{ background: activeHero.color || '#f5d9ea' }}
                    >
                      {activeHero.image ? (
                        <img
                          src={activeHero.image}
                          alt={activeHero.name}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{activeHero.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <label className="uploadLabelBtn primaryUpload fullBtn">
                      <Upload size={14} /> อัปโหลดรูป {activeHero.name} จากเครื่อง
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleInlineHeroImageUpload}
                      />
                    </label>
                    {activeHero.image && (
                      <button
                        type="button"
                        className="clearImgBtn"
                        onClick={() =>
                          handleUpdateHero(activeHero.id, { image: '' })
                        }
                      >
                        ลบรูปภาพฮีโร่
                      </button>
                    )}
                  </div>

                  <div className="heroInlineFormCol">
                    <div className="inlineFormRow">
                      <div className="fieldGroup">
                        <label>ชื่อฮีโร่ (Hero Name)</label>
                        <input
                          value={activeHero.name}
                          onChange={(e) =>
                            handleUpdateHero(activeHero.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="ชื่อฮีโร่..."
                        />
                      </div>
                      <div className="fieldGroup">
                        <label>ฉายา / รายละเอียดฮีโร่</label>
                        <input
                          value={activeHero.title || ''}
                          onChange={(e) =>
                            handleUpdateHero(activeHero.id, {
                              title: e.target.value,
                            })
                          }
                          placeholder="เช่น Archangel / Pistol Assassin"
                        />
                      </div>
                    </div>

                    <div className="fieldGroup">
                      <label>
                        <Link2 size={13} /> ช่องใส่ลิงก์ URL รูปภาพฮีโร่ (
                        {activeHero.name})
                      </label>
                      <input
                        value={activeHero.image || ''}
                        onChange={(e) =>
                          handleUpdateHero(activeHero.id, {
                            image: e.target.value,
                          })
                        }
                        placeholder="วางลิงก์รูปภาพฮีโร่ (https://...) หรือกดอัปโหลดไฟล์รูปจากเครื่องด้านซ้าย"
                      />
                    </div>

                    <form
                      className="inlineQuickSkinForm"
                      onSubmit={handleQuickAddSkinSubmit}
                    >
                      <label>
                        <Plus size={13} /> เพิ่มรูปสกินใหม่ให้{' '}
                        <b>{activeHero.name}</b> ทันที:
                      </label>
                      <div className="quickSkinControls">
                        <input
                          placeholder="ชื่อสกินสำหรับค้นหา (ไม่บังคับ)"
                          value={quickSkinName}
                          onChange={(e) => setQuickSkinName(e.target.value)}
                        />
                        <input
                          placeholder="ลิงก์ URL รูปสกิน (หรืออัปโหลดไฟล์)"
                          value={quickSkinImage}
                          onChange={(e) => setQuickSkinImage(e.target.value)}
                        />
                        <label className="uploadLabelBtn">
                          <ImageIcon size={14} />{' '}
                          {quickSkinImage ? 'มีรูปแล้ว ✓' : 'อัปโหลดรูปสกิน'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={handleQuickSkinImageUpload}
                          />
                        </label>
                        <button type="submit" className="primary">
                          <Plus size={15} /> เพิ่มสกิน
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            <div className="bottomActions">
              <span className="muted">
                ฮีโร่ที่เลือก: <b>{activeHero?.name}</b> · เลือกสกินไว้แล้วทั้งหมด{' '}
                <b className="tabular">{selectedSkins.length}</b> รูป
              </span>
              <button className="primary" onClick={() => setStep(2)}>
                ไปเลือกสกินเข้าคอลเลกชัน <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 2: SORTSKIN-STYLE 2-PANE WORKSPACE
            - Left Pane: Hero Categories (Click a Hero to expand its skins inside the compact drawer)
            - Right Pane: Unified Live Preview & Reorder Board ("ตารางของคุณ N สกิน")
              Always visible on mobile without scrolling past hundreds of skins!
           ============================================================ */}
        {step === 2 && (
          <div className="panel sortskinWorkspacePanel">
            <div className="sortskinTwoPaneLayout">
              {/* ==================================================
                  LEFT SIDEBAR: HERO CATEGORIES & NESTED SKIN DRAWER
                 ================================================== */}
              <aside
                className={
                  'sortskinSidebar ' +
                  (isMobilePickerCollapsed ? 'collapsedMobile' : '')
                }
              >
                {/* Top Header Bar: "ฮีโร่ 125" + Upload + Mobile Collapse Toggle */}
                <div className="sortskinSidebarTabs">
                  <button
                    type="button"
                    className="sortskinTabBtn active"
                    onClick={() => {
                      setPickerHeroId(null);
                      setSkinQuery('');
                      setIsMobilePickerCollapsed(false);
                    }}
                  >
                    <span>ฮีโร่</span>
                    <small className="tabular">{heroes.length}</small>
                  </button>

                  <div className="sortskinSidebarRightActions">
                    <button
                      type="button"
                      className="sortskinMiniUploadBtn"
                      onClick={() => setIsManagerOpen(true)}
                      title="เพิ่มหรือแก้ไขรูปภาพสกินในคลัง"
                    >
                      <Upload size={12} /> จัดการคลังรูป
                    </button>

                    <button
                      type="button"
                      className="mobileCollapseToggleBtn"
                      onClick={() =>
                        setIsMobilePickerCollapsed((prev) => !prev)
                      }
                    >
                      {isMobilePickerCollapsed
                        ? 'เลือกสกินเพิ่ม ▼'
                        : 'ย่อหมวดฮีโร่ ▲'}
                    </button>
                  </div>
                </div>

                {!isMobilePickerCollapsed && (
                  <div className="sortskinSidebarBody">
                    {/* HERO CATEGORY LIST (Always visible on the left) */}
                    <div className="sortskinSearchBox">
                      <Search size={15} />
                      <input
                        placeholder="ค้นหาฮีโร่..."
                        value={heroQuery}
                        onChange={(e) => setHeroQuery(e.target.value)}
                      />
                      {heroQuery && (
                        <button
                          type="button"
                          className="clearSearchInlineBtn"
                          onClick={() => setHeroQuery('')}
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div className="sortskinHeroList">
                      {filteredHeroes.map((h, i) => {
                        const selectedCountForHero = selectedSkins.filter(
                          (item) => item.heroId === h.id
                        ).length;
                        const totalSkinsForHero = h.skins?.length || 0;
                        const previewImg =
                          h.image || h.skins?.[0]?.image || '';
                        const isCurrentOpen = pickerHero?.id === h.id;

                        return (
                          <button
                            type="button"
                            key={h.id}
                            className={
                              'sortskinHeroRow ' +
                              (isCurrentOpen ? 'activeHeroRow ' : '') +
                              (selectedCountForHero > 0 ? 'hasPicked' : '')
                            }
                            onClick={() => {
                              setPickerHeroId((prev) =>
                                prev === h.id ? null : h.id
                              );
                              setActiveHeroId(h.id);
                              setSkinQuery('');
                            }}
                          >
                            <div
                              className="sortskinHeroAvatar"
                              style={{
                                background:
                                  h.color ||
                                  PASTEL_PALETTE[i % PASTEL_PALETTE.length],
                              }}
                            >
                              {previewImg ? (
                                <img
                                  src={previewImg}
                                  alt={h.name}
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span>{h.name.slice(0, 1)}</span>
                              )}
                              {selectedCountForHero > 0 && (
                                <i className="heroActiveDot" />
                              )}
                            </div>

                            <div className="sortskinHeroMeta">
                              <b>{h.name}</b>
                              <small className="tabular">
                                {selectedCountForHero > 0 ? (
                                  <>
                                    <strong>{selectedCountForHero}</strong>/
                                    {totalSkinsForHero} สกิน
                                  </>
                                ) : (
                                  <>{totalSkinsForHero} สกิน</>
                                )}
                              </small>
                            </div>

                            <span className="sortskinChevron">›</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* FLOATING SKIN POPOVER PANEL EMERGING FROM HERO CATEGORY (Matches IMG_0443) */}
                    {pickerHero && (
                      <div
                        className="heroSkinsFloatingPopover"
                        role="dialog"
                        aria-label={`เลือกสกินของ ${pickerHero.name}`}
                      >
                        <div className="floatingPopoverHeader">
                          <div className="floatingPopoverTitle">
                            <span>ฮีโร่</span>
                            <b>{pickerHero.name}</b>
                          </div>

                          <div className="floatingPopoverRight">
                            {pickerHero.skins?.length > 0 && (
                              <button
                                type="button"
                                className="floatingSelectAllBtn"
                                onClick={() => {
                                  pickerHero.skins.forEach((sk) =>
                                    addSkinSelection(pickerHero, sk)
                                  );
                                  notify(
                                    `เพิ่มสกินทั้งหมดของ ${pickerHero.name} เข้าตารางแล้ว`
                                  );
                                }}
                              >
                                + เลือกทั้งหมด
                              </button>
                            )}

                            <span className="floatingPopoverCount tabular">
                              {
                                selectedSkins.filter(
                                  (s) => s.heroId === pickerHero.id
                                ).length
                              }
                              /{pickerHero.skins?.length || 0}
                            </span>

                            <button
                              type="button"
                              className="floatingPopoverCloseBtn"
                              onClick={() => {
                                setPickerHeroId(null);
                                setSkinQuery('');
                              }}
                              title="ปิดหน้าต่างเลือกสกิน"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {pickerHero.skins?.length > 8 && (
                          <div className="floatingPopoverSearchRow">
                            <div className="sortskinSearchBox compactSearch">
                              <Search size={14} />
                              <input
                                placeholder={`ค้นหาสกินของ ${pickerHero.name}...`}
                                value={skinQuery}
                                onChange={(e) => setSkinQuery(e.target.value)}
                              />
                              {skinQuery && (
                                <button
                                  type="button"
                                  className="clearSearchInlineBtn"
                                  onClick={() => setSkinQuery('')}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="floatingPopoverBody">
                          {!pickerHero.skins || pickerHero.skins.length === 0 ? (
                            <div className="nestedEmptySkinBox">
                              <p>ยังไม่มีรูปสกินของ {pickerHero.name}</p>
                              <button
                                type="button"
                                className="primary"
                                onClick={() => {
                                  setActiveHeroId(pickerHero.id);
                                  setIsManagerOpen(true);
                                }}
                              >
                                <Upload size={14} /> อัปโหลดรูปสกิน{' '}
                                {pickerHero.name}
                              </button>
                            </div>
                          ) : (
                            <div className="floatingPopoverSkinGrid">
                              {pickerHero.skins
                                .filter((s) =>
                                  s.name
                                    .toLowerCase()
                                    .includes(skinQuery.toLowerCase())
                                )
                                .map((s, idx) => {
                                  const selectedCount = getSkinSelectedCount(
                                    pickerHero.id,
                                    s.id
                                  );
                                  const chosen = selectedCount > 0;
                                  const displayImg =
                                    s.image || pickerHero.image || '';

                                  return (
                                    <div
                                      key={s.id}
                                      className={
                                        'floatingPopoverSkinCard ' +
                                        (chosen ? 'chosen' : '')
                                      }
                                      onClick={() =>
                                        addSkinSelection(pickerHero, s)
                                      }
                                      title="แตะเพื่อเพิ่มสกินเข้าตาราง (แตะซ้ำเพื่อเพิ่มรูปเดิมซ้ำได้)"
                                    >
                                      <div
                                        className="floatingPopoverSkinArt"
                                        style={{
                                          background:
                                            pickerHero.color ||
                                            PASTEL_PALETTE[
                                              idx % PASTEL_PALETTE.length
                                            ],
                                        }}
                                      >
                                        {displayImg ? (
                                          <img
                                            src={displayImg}
                                            alt={s.name}
                                            referrerPolicy="no-referrer"
                                            draggable={false}
                                          />
                                        ) : (
                                          <span>{s.name.slice(0, 2)}</span>
                                        )}

                                        {chosen && (
                                          <b className="skinCountBadge tabular">
                                            ×{selectedCount}
                                          </b>
                                        )}

                                        {chosen && (
                                          <button
                                            type="button"
                                            className="floatingSkinMinusBtn"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              removeOneSkinInstance(
                                                pickerHero.id,
                                                s.id
                                              );
                                            }}
                                            title="ลดจำนวนสกินนี้ลง 1 รูป"
                                          >
                                            −
                                          </button>
                                        )}

                                        <div className="floatingSkinBottomCaption">
                                          <b>{s.name}</b>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </aside>

              {/* ==================================================
                  RIGHT MAIN BOARD: LIVE PREVIEW & REORDER TABLE
                  ("ตารางของคุณ N สกิน" — matches reference image)
                 ================================================== */}
              <div className="sortskinMainBoard">
                {/* Top Toolbar matching reference screenshot */}
                <div className="sortskinBoardToolbar">
                  <div className="boardTitleGroup">
                    <span className="boardStatusDot" />
                    <b>ตารางของคุณ</b>
                    <span className="boardSkinCount tabular">
                      {selectedSkins.length} สกิน
                    </span>
                  </div>

                  <div className="boardActionsGroup">
                    <button
                      type="button"
                      className="boardToolBtn undoRedoBtn"
                      onClick={handleUndo}
                      disabled={!undoStack.length}
                      title="ย้อนกลับการแก้ไขล่าสุด (Ctrl+Z)"
                    >
                      <Undo2 size={13} /> ย้อนกลับ
                      {undoStack.length > 0 && (
                        <small className="tabular">({undoStack.length})</small>
                      )}
                    </button>

                    <button
                      type="button"
                      className="boardToolBtn undoRedoBtn iconOnlyBtn"
                      onClick={handleRedo}
                      disabled={!redoStack.length}
                      title="ทำซ้ำรายการที่ย้อนกลับ (Ctrl+Y)"
                    >
                      <Redo2 size={13} />
                    </button>

                    <button
                      type="button"
                      className="boardToolBtn"
                      onClick={sortSkinsByHero}
                      disabled={!selectedSkins.length}
                      title="เรียงตามฮีโร่ (A → Z)"
                    >
                      <Sparkles size={13} /> เรียงฮีโร่
                    </button>

                    <button
                      type="button"
                      className="boardToolBtn"
                      onClick={reverseSkinsOrder}
                      disabled={!selectedSkins.length}
                      title="สลับลำดับหน้า-หลัง"
                    >
                      ⇄ สลับลำดับ
                    </button>

                    <button
                      type="button"
                      className={
                        'boardToolBtn ' + (hideBoardBadges ? 'active' : '')
                      }
                      onClick={() => setHideBoardBadges((prev) => !prev)}
                      disabled={!selectedSkins.length}
                      title="ซ่อนหรือแสดงเลขลำดับและปุ่มลบเพื่อดูภาพไร้ขอบล้วน"
                    >
                      {hideBoardBadges ? '👁 แสดงเลขลำดับ' : '👁 ดูไร้ขอบล้วน'}
                    </button>

                    <button
                      type="button"
                      className="boardToolBtn dangerTextBtn"
                      onClick={clearAllSelectedSkins}
                      disabled={!selectedSkins.length}
                    >
                      <Trash2 size={13} /> ล้าง
                    </button>

                    {/* Column Slider Pill (1 to 20 columns, matching top-right of screenshot) */}
                    <div
                      className="sortskinColSliderPill"
                      title="ปรับจำนวนรูปต่อแถว (1–20 รูป)"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setLayout((l) => ({
                            ...l,
                            columns: Math.max(1, (l.columns || 6) - 1),
                          }))
                        }
                        disabled={layout.columns <= 1}
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={layout.columns || 6}
                        onChange={(e) =>
                          setLayout({
                            ...layout,
                            columns: Number(e.target.value),
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setLayout((l) => ({
                            ...l,
                            columns: Math.min(20, (l.columns || 6) + 1),
                          }))
                        }
                        disabled={layout.columns >= 20}
                      >
                        +
                      </button>
                      <b className="tabular">{layout.columns}</b>
                    </div>

                    <button
                      type="button"
                      className="primary boardDownloadBtn"
                      onClick={handleDownloadPng}
                      disabled={isExporting || !selectedSkins.length}
                      title={`ดาวน์โหลดภาพขนาดรวม ${exportDimensionsInfo.totalWidth.toLocaleString()} × ${exportDimensionsInfo.totalHeight.toLocaleString()} px`}
                    >
                      <Download size={14} />{' '}
                      {isExporting
                        ? 'กำลังสร้าง...'
                        : `ดาวน์โหลด PNG (${currentQualityOption.badge})`}
                    </button>
                  </div>
                </div>

                {/* Image Resolution / Sharpness Level Strip */}
                <div className="sortskinQualityStrip">
                  <div className="qualityGroupLeft">
                    <span className="qualityStripLabel">
                      <ImageIcon size={12} /> ความชัดรูป:
                    </span>
                    <div className="qualityOptionChips">
                      {EXPORT_QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={
                            'qualityChipBtn ' +
                            (exportQualityId === opt.id ? 'active' : '')
                          }
                          onClick={() => setExportQualityId(opt.id)}
                          title={opt.label}
                        >
                          <b>{opt.shortLabel}</b>
                          <small className="tabular">
                            {opt.tileWidth}×{opt.tileHeight}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="qualityGroupRight">
                    <button
                      type="button"
                      className={
                        'crispToggleBtn ' + (sharpenExport ? 'active' : '')
                      }
                      onClick={() => setSharpenExport((prev) => !prev)}
                      title="เร่งความคมชัดของขอบภาพและตัวอักษรตอนบันทึกไฟล์ PNG"
                    >
                      ✨ เร่งความคมชัด {sharpenExport ? 'เปิด' : 'ปิด'}
                    </button>
                    {selectedSkins.length > 0 && (
                      <span className="totalResolutionBadge tabular">
                        ขนาดภาพรวม:{' '}
                        <b>
                          {exportDimensionsInfo.totalWidth.toLocaleString()} ×{' '}
                          {exportDimensionsInfo.totalHeight.toLocaleString()} px
                        </b>
                      </span>
                    )}
                  </div>
                </div>

                {/* Smart Column Recommendation Strip */}
                {selectedSkins.length > 0 && (
                  <div className="sortskinRecStrip">
                    <span className="recStripLabel">
                      <Sparkles size={12} /> แนะนำสำหรับ {selectedSkins.length}{' '}
                      รูป:
                    </span>
                    <div className="recStripChips">
                      {recommendedColsList.map((rec) => (
                        <button
                          key={rec.cols}
                          type="button"
                          className={
                            'recColBtn ' +
                            (layout.columns === rec.cols ? 'active' : '')
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
                  </div>
                )}

                {/* Active Swap / Selection Bar (Mobile & Desktop Tap-to-Swap) */}
                {selectedSkins.length > 0 && activeArrangeItem && (
                  <div className="mobileSwapBanner hasSelection compactSwapBanner">
                    <div className="activeSwapControls">
                      <div className="activeSwapTitle">
                        <span className="swapBadge tabular">
                          รูปที่ #{selectedArrangeIdx + 1}
                        </span>
                        <b>{activeArrangeItem.name}</b>
                        <small>แตะรูปอื่นในตารางเพื่อสลับที่กันทันที</small>
                      </div>
                      <div className="activeSwapBtns">
                        <button
                          type="button"
                          onClick={() => moveSkinToIndex(selectedArrangeIdx, 0)}
                          disabled={selectedArrangeIdx === 0}
                        >
                          ⏮ แรกสุด
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            moveSelectedSkin(selectedArrangeIdx, -1)
                          }
                          disabled={selectedArrangeIdx === 0}
                        >
                          ← ซ้าย
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            moveSelectedSkin(selectedArrangeIdx, 1)
                          }
                          disabled={
                            selectedArrangeIdx === selectedSkins.length - 1
                          }
                        >
                          ขวา →
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            moveSkinToIndex(
                              selectedArrangeIdx,
                              selectedSkins.length - 1
                            )
                          }
                          disabled={
                            selectedArrangeIdx === selectedSkins.length - 1
                          }
                        >
                          ท้ายสุด ⏭
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            duplicateSkinAtIndex(selectedArrangeIdx)
                          }
                        >
                          + ซ้ำ
                        </button>
                        <button
                          type="button"
                          className="dangerSwapBtn"
                          onClick={() => {
                            const targetUid = activeArrangeItem.uid;
                            commitSelectedSkins((prev) =>
                              prev.filter((x) => x.uid !== targetUid)
                            );
                            setSelectedArrangeIdx(null);
                          }}
                        >
                          ลบ
                        </button>
                        <button
                          type="button"
                          className="cancelSwapBtn"
                          onClick={() => setSelectedArrangeIdx(null)}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Unified Live Seamless Preview & Reorder Grid */}
                {selectedSkins.length === 0 ? (
                  <div className="sortskinEmptyBoard">
                    <Sparkles size={26} />
                    <b>ยังไม่ได้เลือกสกินเข้าตาราง</b>
                    <p>
                      คลิกเลือกหมวดฮีโร่ด้านซ้าย (หรือด้านบนในมือถือ) แล้วแตะสกินเพื่อนำมาเรียงโชว์ในพรีวิวนี้ได้เลย
                    </p>
                  </div>
                ) : (
                  <div className="sortskinLiveBoardCanvasWrap">
                    <div
                      ref={previewRef}
                      className="sortskinPreviewGrid"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(
                          1,
                          Math.min(20, Number(layout.columns) || 6)
                        )}, minmax(0, 1fr))`,
                      }}
                    >
                      {selectedSkins.map((item, i) => {
                        const heroObj = heroesById[item.heroId];
                        const imgSrc = item.image || heroObj?.image || '';
                        const isSelectedForSwap = selectedArrangeIdx === i;
                        const tileBg =
                          heroObj?.color ||
                          PASTEL_PALETTE[i % PASTEL_PALETTE.length];

                        return (
                          <div
                            key={item.uid}
                            data-arrange-index={i}
                            className={
                              'seamlessSkinTile sortskinBoardTile ' +
                              (dragIndex === i ? 'dragging ' : '') +
                              (isSelectedForSwap ? 'selectedForSwap ' : '')
                            }
                            onPointerDown={(e) =>
                              handleTilePointerDown(
                                e,
                                i,
                                item,
                                imgSrc,
                                tileBg
                              )
                            }
                            onPointerMove={handleTilePointerMove}
                            onPointerUp={handleTilePointerUp}
                            onPointerCancel={handleTilePointerUp}
                            onContextMenu={(e) => e.preventDefault()}
                            style={{
                              background: tileBg,
                            }}
                          >
                            {imgSrc && (
                              <img
                                src={imgSrc}
                                alt=""
                                crossOrigin="anonymous"
                                decoding="sync"
                                referrerPolicy="no-referrer"
                                draggable={false}
                              />
                            )}

                            {/* Top-Left Number Badge (Matches Screenshot "1, 2, 3...") */}
                            {!hideBoardBadges && (
                              <div
                                className="boardTileNumBadge tabular"
                                title="แตะลากที่ตัวการ์ดเพื่อย้ายตำแหน่ง หรือแตะ 2 รูปเพื่อสลับที่"
                              >
                                {i + 1}
                              </div>
                            )}

                            {/* Top-Right Remove Circle Button (Matches Screenshot "×") */}
                            {!hideBoardBadges && (
                              <button
                                type="button"
                                className="boardTileCloseBtn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitSelectedSkins((prev) =>
                                    prev.filter((x) => x.uid !== item.uid)
                                  );
                                  if (selectedArrangeIdx === i) {
                                    setSelectedArrangeIdx(null);
                                  }
                                }}
                                title="ลบสกินนี้ออกจากตาราง"
                              >
                                ×
                              </button>
                            )}

                            {isSelectedForSwap && (
                              <div className="swapSelectedOverlay">
                                <span>แตะรูปอื่นเพื่อสลับ</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="boardHintFooter">
                      <span>
                        💡 <b>ลากสลับตำแหน่งได้ลื่น ๆ บน iPad / มือถือ / คอม:</b> แตะลากที่รูปสกินเพื่อเลื่อนสลับตำแหน่งได้ทันที (หรือแตะ 2 รูปเพื่อสลับที่กัน) · เวลา<b>ดาวน์โหลด PNG</b> ระบบจะตัดตัวเลขและปุ่มออกให้อัตโนมัติ
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 3 & STEP 4: FULL-WIDTH SORTSKIN PREVIEW & REORDER BOARD
            (Matches reference image IMG_0434 on iPad, Mobile & Desktop)
           ============================================================ */}
        {(step === 3 || step === 4) && (
          <div className="panel sortskinWorkspacePanel">
            <div className="sortskinMainBoard fullWidthPreviewBoard">
              {/* Top Toolbar matching IMG_0434 */}
              <div className="sortskinBoardToolbar">
                <div className="boardTitleGroup">
                  <span className="boardStatusDot" />
                  <b>ตารางของคุณ</b>
                  <span className="boardSkinCount tabular">
                    {selectedSkins.length} สกิน
                  </span>
                </div>

                <div className="boardActionsGroup">
                  <button
                    type="button"
                    className="boardToolBtn undoRedoBtn"
                    onClick={handleUndo}
                    disabled={!undoStack.length}
                    title="ย้อนกลับการแก้ไขล่าสุด (Ctrl+Z)"
                  >
                    <Undo2 size={13} /> ย้อนกลับ
                    {undoStack.length > 0 && (
                      <small className="tabular">({undoStack.length})</small>
                    )}
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn undoRedoBtn iconOnlyBtn"
                    onClick={handleRedo}
                    disabled={!redoStack.length}
                    title="ทำซ้ำรายการที่ย้อนกลับ (Ctrl+Y)"
                  >
                    <Redo2 size={13} />
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn"
                    onClick={() => setStep(2)}
                    title="กลับไปเลือกสกินเพิ่ม"
                  >
                    + เลือกสกินเพิ่ม
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn"
                    onClick={sortSkinsByHero}
                    disabled={!selectedSkins.length}
                  >
                    <Sparkles size={13} /> AI เรียงฮีโร่
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn"
                    onClick={reverseSkinsOrder}
                    disabled={!selectedSkins.length}
                  >
                    ⇄ สลับลำดับ
                  </button>

                  <button
                    type="button"
                    className={
                      'boardToolBtn ' + (hideBoardBadges ? 'active' : '')
                    }
                    onClick={() => setHideBoardBadges((prev) => !prev)}
                    disabled={!selectedSkins.length}
                  >
                    {hideBoardBadges ? '👁 แสดงเลขลำดับ' : '👁 ซ่อนเลข/ปุ่ม'}
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn"
                    onClick={handleSaveToCollection}
                    disabled={!selectedSkins.length}
                  >
                    <FolderHeart size={13} /> บันทึก
                  </button>

                  <button
                    type="button"
                    className="boardToolBtn dangerTextBtn"
                    onClick={clearAllSelectedSkins}
                    disabled={!selectedSkins.length}
                  >
                    <Trash2 size={13} /> ล้าง
                  </button>

                  {/* Column Slider Pill (1 to 20 columns, matching top-right of IMG_0434) */}
                  <div
                    className="sortskinColSliderPill"
                    title="ปรับจำนวนรูปต่อแถว (1–20 รูป)"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.max(1, (l.columns || 6) - 1),
                        }))
                      }
                      disabled={layout.columns <= 1}
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={layout.columns || 6}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          columns: Number(e.target.value),
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.min(20, (l.columns || 6) + 1),
                        }))
                      }
                      disabled={layout.columns >= 20}
                    >
                      +
                    </button>
                    <b className="tabular">{layout.columns}</b>
                  </div>

                  <button
                    type="button"
                    className="primary boardDownloadBtn"
                    onClick={handleDownloadPng}
                    disabled={isExporting || !selectedSkins.length}
                    title={`ดาวน์โหลดภาพขนาดรวม ${exportDimensionsInfo.totalWidth.toLocaleString()} × ${exportDimensionsInfo.totalHeight.toLocaleString()} px`}
                  >
                    <Download size={14} />{' '}
                    {isExporting
                      ? 'กำลังสร้าง...'
                      : `ดาวน์โหลด PNG (${currentQualityOption.badge})`}
                  </button>
                </div>
              </div>

              {/* Image Resolution / Sharpness Level Strip */}
              <div className="sortskinQualityStrip">
                <div className="qualityGroupLeft">
                  <span className="qualityStripLabel">
                    <ImageIcon size={12} /> ความชัดรูป:
                  </span>
                  <div className="qualityOptionChips">
                    {EXPORT_QUALITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={
                          'qualityChipBtn ' +
                          (exportQualityId === opt.id ? 'active' : '')
                        }
                        onClick={() => setExportQualityId(opt.id)}
                        title={opt.label}
                      >
                        <b>{opt.shortLabel}</b>
                        <small className="tabular">
                          {opt.tileWidth}×{opt.tileHeight}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="qualityGroupRight">
                  <button
                    type="button"
                    className={
                      'crispToggleBtn ' + (sharpenExport ? 'active' : '')
                    }
                    onClick={() => setSharpenExport((prev) => !prev)}
                    title="เร่งความคมชัดของขอบภาพและตัวอักษรตอนบันทึกไฟล์ PNG"
                  >
                    ✨ เร่งความคมชัด {sharpenExport ? 'เปิด' : 'ปิด'}
                  </button>
                  {selectedSkins.length > 0 && (
                    <span className="totalResolutionBadge tabular">
                      ขนาดภาพรวม:{' '}
                      <b>
                        {exportDimensionsInfo.totalWidth.toLocaleString()} ×{' '}
                        {exportDimensionsInfo.totalHeight.toLocaleString()} px
                      </b>
                    </span>
                  )}
                </div>
              </div>

              {/* Smart Column Recommendations + 1-20 Quick Numbers */}
              <div className="sortskinRecStrip">
                <span className="recStripLabel">
                  <Sparkles size={12} /> แนะนำสำหรับ {selectedSkins.length} รูป:
                </span>
                <div className="recStripChips">
                  {recommendedColsList.map((rec) => (
                    <button
                      key={rec.cols}
                      type="button"
                      className={
                        'recColBtn ' +
                        (layout.columns === rec.cols ? 'active' : '')
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
              </div>

              {/* Active Swap Banner */}
              {selectedSkins.length > 0 && activeArrangeItem && (
                <div className="mobileSwapBanner hasSelection compactSwapBanner">
                  <div className="activeSwapControls">
                    <div className="activeSwapTitle">
                      <span className="swapBadge tabular">
                        รูปที่ #{selectedArrangeIdx + 1}
                      </span>
                      <b>{activeArrangeItem.name}</b>
                      <small>แตะรูปอื่นในตารางเพื่อสลับที่กันทันที</small>
                    </div>
                    <div className="activeSwapBtns">
                      <button
                        type="button"
                        onClick={() => moveSkinToIndex(selectedArrangeIdx, 0)}
                        disabled={selectedArrangeIdx === 0}
                      >
                        ⏮ แรกสุด
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedSkin(selectedArrangeIdx, -1)}
                        disabled={selectedArrangeIdx === 0}
                      >
                        ← ซ้าย
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedSkin(selectedArrangeIdx, 1)}
                        disabled={
                          selectedArrangeIdx === selectedSkins.length - 1
                        }
                      >
                        ขวา →
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          moveSkinToIndex(
                            selectedArrangeIdx,
                            selectedSkins.length - 1
                          )
                        }
                        disabled={
                          selectedArrangeIdx === selectedSkins.length - 1
                        }
                      >
                        ท้ายสุด ⏭
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          duplicateSkinAtIndex(selectedArrangeIdx)
                        }
                      >
                        + ซ้ำ
                      </button>
                      <button
                        type="button"
                        className="dangerSwapBtn"
                        onClick={() => {
                          const targetUid = activeArrangeItem.uid;
                          commitSelectedSkins((prev) =>
                            prev.filter((x) => x.uid !== targetUid)
                          );
                          setSelectedArrangeIdx(null);
                        }}
                      >
                        ลบ
                      </button>
                      <button
                        type="button"
                        className="cancelSwapBtn"
                        onClick={() => setSelectedArrangeIdx(null)}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Full-Width Multi-Column Preview Grid (Matches IMG_0434) */}
              {selectedSkins.length === 0 ? (
                <div className="sortskinEmptyBoard">
                  <Sparkles size={26} />
                  <b>ยังไม่ได้เลือกสกินเข้าตาราง</b>
                  <p>กลับไปที่หน้า 2 เพื่อเลือกสกินเข้าตารางพรีวิวได้เลย</p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setStep(2)}
                  >
                    ไปเลือกสกิน <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="sortskinLiveBoardCanvasWrap fullBoardWrap">
                  <div
                    ref={previewRef}
                    className="sortskinPreviewGrid"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(
                        1,
                        Math.min(20, Number(layout.columns) || 6)
                      )}, minmax(0, 1fr))`,
                    }}
                  >
                    {selectedSkins.map((item, i) => {
                      const heroObj = heroesById[item.heroId];
                      const imgSrc = item.image || heroObj?.image || '';
                      const isSelectedForSwap = selectedArrangeIdx === i;
                      const tileBg =
                        heroObj?.color ||
                        PASTEL_PALETTE[i % PASTEL_PALETTE.length];

                      return (
                        <div
                          key={item.uid}
                          data-arrange-index={i}
                          className={
                            'seamlessSkinTile sortskinBoardTile ' +
                            (dragIndex === i ? 'dragging ' : '') +
                            (isSelectedForSwap ? 'selectedForSwap ' : '')
                          }
                          onPointerDown={(e) =>
                            handleTilePointerDown(
                              e,
                              i,
                              item,
                              imgSrc,
                              tileBg
                            )
                          }
                          onPointerMove={handleTilePointerMove}
                          onPointerUp={handleTilePointerUp}
                          onPointerCancel={handleTilePointerUp}
                          onContextMenu={(e) => e.preventDefault()}
                          style={{
                            background: tileBg,
                          }}
                        >
                          {imgSrc && (
                            <img
                              src={imgSrc}
                              alt=""
                              crossOrigin="anonymous"
                              decoding="sync"
                              referrerPolicy="no-referrer"
                              draggable={false}
                            />
                          )}

                          {!hideBoardBadges && (
                            <div
                              className="boardTileNumBadge tabular"
                              title="แตะลากที่ตัวการ์ดเพื่อย้ายตำแหน่ง หรือแตะ 2 รูปเพื่อสลับที่"
                            >
                              {i + 1}
                            </div>
                          )}

                          {!hideBoardBadges && (
                            <button
                              type="button"
                              className="boardTileCloseBtn"
                              onClick={(e) => {
                                e.stopPropagation();
                                commitSelectedSkins((prev) =>
                                  prev.filter((x) => x.uid !== item.uid)
                                );
                                if (selectedArrangeIdx === i) {
                                  setSelectedArrangeIdx(null);
                                }
                              }}
                              title="ลบสกินนี้ออกจากตาราง"
                            >
                              ×
                            </button>
                          )}

                          {isSelectedForSwap && (
                            <div className="swapSelectedOverlay">
                              <span>แตะรูปอื่นเพื่อสลับ</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="boardHintFooter">
                    <span>
                      💡 <b>ลากสลับตำแหน่งได้ลื่น ๆ บน iPad / มือถือ / คอม:</b> แตะลากที่รูปสกินเพื่อเลื่อนสลับตำแหน่งได้ทันที (หรือแตะ 2 รูปเพื่อสลับที่กัน) · เมื่อกด<b>ดาวน์โหลด PNG</b> จะได้ภาพคอลเลกชันไร้ขอบความละเอียดสูง
                    </span>
                  </div>
                </div>
              )}

              {savedPosters.length > 0 && (
                <div
                  className="savedCollectionSection"
                  style={{ padding: '0 20px 20px' }}
                >
                  <h4>
                    <FolderHeart size={17} /> คอลเลกชันที่บันทึกไว้ (
                    {savedPosters.length})
                  </h4>
                  <div className="savedPostersGrid">
                    {savedPosters.map((entry, idx) => (
                      <div key={entry.id} className="savedPosterItem">
                        <div>
                          <b>คอลเลกชัน #{savedPosters.length - idx}</b>
                          <small>
                            บันทึกเมื่อ {entry.savedAt} ·{' '}
                            {entry.selectedSkins?.length || 0} รูป ·{' '}
                            {entry.layout?.columns || 6} รูปต่อแถว
                          </small>
                        </div>
                        <div className="savedPosterActions">
                          <button
                            className="secondary"
                            onClick={() => handleLoadSavedPoster(entry)}
                          >
                            <Check size={14} /> โหลดคอลเลกชันนี้
                          </button>
                          <button
                            className="iconTrashBtn"
                            onClick={() => handleDeleteSavedPoster(entry.id)}
                            title="ลบรายการนี้"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Movable Floating Image Scratchpad UI */}
      <FloatingScratchpad
        onCaptureCurrentBoard={handleCaptureBoardToScratchpad}
        hasBoardSkins={selectedSkins.length > 0}
        notify={notify}
      />

      {/* Full Hero & Skin Database Manager Modal */}
      <HeroSkinModal
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        heroes={heroes}
        activeHeroId={activeHero?.id}
        onSelectHeroId={setActiveHeroId}
        onUpdateHero={handleUpdateHero}
        onAddHero={handleAddHero}
        onDeleteHero={handleDeleteHero}
        onAddSkin={handleAddSkin}
        onUpdateSkin={handleUpdateSkin}
        onDeleteSkin={handleDeleteSkin}
        onResetCatalog={handleResetCatalog}
        onExportCatalog={handleExportCatalog}
        onImportCatalog={handleImportCatalog}
      />

      <footer>
        ♡ RoV Skin Collection Generator{' '}
        <span>Seamless Skin Grid · White Angel Edition</span>
      </footer>
    </main>
  );
}

export default App;
