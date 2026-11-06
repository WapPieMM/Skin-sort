import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminLogin from './components/AdminLogin';
import { toPng } from 'html-to-image';
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
} from 'lucide-react';
import {
  DEFAULT_HEROES,
  PASTEL_PALETTE,
} from './data/defaultCatalog';
import { uploadImageFile } from './utils/cloudStorage';
import HeroSkinModal from './components/HeroSkinModal';
import PosterCanvas from './components/PosterCanvas';
import { loadCatalogFromIndexedDB, saveCatalogToIndexedDB } from './utils/catalogStorage';

const CATALOG_STORAGE_KEY = 'rov_white_angel_catalog_v2';
const CATALOG_SKIN_MIGRATION_KEY = 'rov_white_angel_catalog_skins_cleared_v1';
const SAVED_POSTERS_KEY = 'rov_white_angel_saved_posters_v2';
const ALL_COLUMN_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1);

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

  // 2. Navigation & Step State
  const [step, setStep] = useState(1);
  const [activeHeroId, setActiveHeroId] = useState(
    () => heroes[0]?.id || 'alice'
  );
  const activeHero = useMemo(
    () => heroes.find((h) => h.id === activeHeroId) || heroes[0],
    [heroes, activeHeroId]
  );

  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // 3. Selected Skin Queue
  const [selectedSkins, setSelectedSkins] = useState([]);

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
          image: s.image || '',
        };
      })
    );
  }, [heroes, heroesById]);

  // 4. Search & Filters
  const [heroQuery, setHeroQuery] = useState('');
  const [skinQuery, setSkinQuery] = useState('');
  const [showAllHeroesSkins, setShowAllHeroesSkins] = useState(false);

  const [quickSkinName, setQuickSkinName] = useState('');
  const [quickSkinImage, setQuickSkinImage] = useState('');

  // 5. Grid Layout State (1 to 20 columns, odd or even)
  const [layout, setLayout] = useState({
    columns: 10,
  });

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

  // Reordering states (Desktop Drag + Mobile Touch Drag + Mobile Tap-to-Swap)
  const [dragIndex, setDragIndex] = useState(null);
  const [selectedArrangeIdx, setSelectedArrangeIdx] = useState(null);
  const touchDragIdxRef = useRef(null);

  const previewRef = useRef(null);

  const handleAdminLogout = async () => {
    try {
      sessionStorage.removeItem('rov_temp_admin_auth');
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      setIsAdminAuthenticated(false);
    }
  };

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
    const uid = `${activeHero.id}__${created.id}`;
    setSelectedSkins((prev) => [
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

  // --- Skin Selection & Sorting Handlers ---
  const isSkinSelected = (heroId, skinId) => {
    const uid = `${heroId}__${skinId}`;
    return selectedSkins.some((item) => item.uid === uid);
  };

  const toggleSkinSelection = (heroObj, skinObj) => {
    const uid = `${heroObj.id}__${skinObj.id}`;
    setSelectedSkins((prev) => {
      if (prev.some((x) => x.uid === uid)) {
        return prev.filter((x) => x.uid !== uid);
      }
      return [
        ...prev,
        {
          uid,
          heroId: heroObj.id,
          heroName: heroObj.name,
          skinId: skinObj.id,
          name: skinObj.name,
          image: skinObj.image || '',
        },
      ];
    });
  };

  const moveSelectedSkin = (idx, dir) => {
    setSelectedSkins((prev) => {
      const arr = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return arr;
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
    setSelectedSkins((prev) => {
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
    setSelectedSkins((prev) => {
      if (idxA >= prev.length || idxB >= prev.length) return prev;
      const copy = [...prev];
      [copy[idxA], copy[idxB]] = [copy[idxB], copy[idxA]];
      return copy;
    });
    setSelectedArrangeIdx(null);
    notify(`สลับตำแหน่งรูปที่ #${idxA + 1} กับ #${idxB + 1} เรียบร้อย`);
  };

  const sortSkinsByHero = () => {
    setSelectedSkins((prev) =>
      [...prev].sort((a, b) => a.heroName.localeCompare(b.heroName))
    );
    setSelectedArrangeIdx(null);
    notify('จัดเรียงรูปสกินแยกตามชื่อฮีโร่ (A → Z) เรียบร้อย!');
  };

  const reverseSkinsOrder = () => {
    setSelectedSkins((prev) => [...prev].reverse());
    setSelectedArrangeIdx(null);
    notify('สลับลำดับรูปสกินหน้า-หลังเรียบร้อย');
  };

  // Desktop HTML5 Drag and Drop
  const handleDragStart = (idx) => {
    setDragIndex(idx);
    setSelectedArrangeIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setSelectedSkins((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(idx, 0, moved);
      return copy;
    });
    setDragIndex(idx);
    setSelectedArrangeIdx(idx);
  };

  const handleDragEnd = () => setDragIndex(null);

  // Mobile Touch Drag-and-Drop on the Drag Handle / Card
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

  // Download Pure Collage PNG
  const handleDownloadPng = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(previewRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement('a');
      a.download = `rov-skin-collection-${selectedSkins.length}skins-${layout.columns}cols.png`;
      a.href = dataUrl;
      a.click();
      notify('ดาวน์โหลดภาพรวมคอลเลกชันสกิน PNG สำเร็จ!');
    } catch {
      notify('เกิดข้อผิดพลาดในการสร้างไฟล์ภาพ กรุณาลองอีกครั้ง');
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
      <button
        className="adminLogoutButton"
        onClick={handleAdminLogout}
        type="button"
      >
        ออกจากระบบแอดมิน
      </button>

      {toastMsg && (
        <div className="floatingToast">
          <Sparkles size={15} />
          <span>{toastMsg}</span>
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
            STEP 2: SELECT SKINS ACROSS HEROES
           ============================================================ */}
        {step === 2 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 2 · เลือกรูปสกินเข้าคอลเลกชัน <Sparkles size={15} />
                </h3>
                <p className="muted">
                  คลิกเลือกรูปสกินจากหลายฮีโร่เพื่อนำมาเรียงต่อกันเป็นตารางเดียว
                </p>
              </div>

              <div className="step2ModeToggle">
                <button
                  className={
                    'filterTab ' + (!showAllHeroesSkins ? 'active' : '')
                  }
                  onClick={() => setShowAllHeroesSkins(false)}
                >
                  เฉพาะฮีโร่ {activeHero?.name} ({activeHero?.skins.length})
                </button>
                <button
                  className={
                    'filterTab ' + (showAllHeroesSkins ? 'active' : '')
                  }
                  onClick={() => setShowAllHeroesSkins(true)}
                >
                  รวมสกินทุกฮีโร่ทั้งหมด
                </button>
              </div>
            </div>

            <div className="heroQuickStrip">
              {heroes.map((h, i) => {
                const count = selectedSkins.filter(
                  (s) => s.heroId === h.id
                ).length;
                return (
                  <button
                    key={h.id}
                    className={
                      'heroStripChip ' +
                      (!showAllHeroesSkins && activeHero?.id === h.id
                        ? 'active'
                        : '')
                    }
                    onClick={() => {
                      setActiveHeroId(h.id);
                      setShowAllHeroesSkins(false);
                    }}
                  >
                    <span
                      className="chipDot"
                      style={{
                        background:
                          h.color || PASTEL_PALETTE[i % PASTEL_PALETTE.length],
                      }}
                    >
                      {h.image ? (
                        <img
                          src={h.image}
                          alt={h.name}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        h.name.slice(0, 1)
                      )}
                    </span>
                    <span>{h.name}</span>
                    {count > 0 && <b className="tabular">{count}</b>}
                  </button>
                );
              })}
            </div>

            <div className="filterBarRow">
              <div className="search flex1">
                <Search size={17} />
                <input
                  placeholder="ค้นหาชื่อสกิน หรือชื่อฮีโร่..."
                  value={skinQuery}
                  onChange={(e) => setSkinQuery(e.target.value)}
                />
              </div>
            </div>

            {displayedSkinEntries.length === 0 ? (
              <div className="emptySkinState">
                <p>ยังไม่มีรูปสกินในหมวดที่เลือก สามารถอัปโหลดรูปสกินเพิ่มได้เลย</p>
                <button
                  className="primary"
                  onClick={() => setIsManagerOpen(true)}
                >
                  <Upload size={15} /> อัปโหลดรูปสกินเข้าคลัง
                </button>
              </div>
            ) : (
              <div className="skinGrid">
                {displayedSkinEntries.map(({ hero: h, skin: s }, i) => {
                  const chosen = isSkinSelected(h.id, s.id);
                  const displayImg = s.image || h.image || '';

                  return (
                    <div
                      key={`${h.id}-${s.id}`}
                      className={'skinTile ' + (chosen ? 'chosen' : '')}
                      onClick={() => toggleSkinSelection(h, s)}
                    >
                      <div
                        className="skinArt"
                        style={{
                          background:
                            h.color ||
                            PASTEL_PALETTE[(i + 1) % PASTEL_PALETTE.length],
                        }}
                      >
                        {displayImg ? (
                          <img
                            src={displayImg}
                            alt={s.name}
                            className="tileHeroImg"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span>
                            {s.name
                              .split(' ')
                              .map((w) => w[0])
                              .join('')
                              .slice(0, 3)}
                          </span>
                        )}

                        {chosen && <b className="check">✓</b>}
                      </div>

                      <div className="skinTileMeta">
                        <b>{s.name}</b>
                        <small>{h.name}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> กลับไปเลือกฮีโร่/ใส่รูป
              </button>
              <div className="selectedSummaryInline">
                <span className="muted">
                  เลือกไว้แล้ว <b className="tabular">{selectedSkins.length}</b>{' '}
                  รูป
                </span>
                <button
                  className="secondary"
                  onClick={() => setIsManagerOpen(true)}
                >
                  <Upload size={14} /> เพิ่ม/แก้ไขรูปสกิน
                </button>
              </div>
              <button
                className="primary"
                disabled={!selectedSkins.length}
                onClick={() => setStep(3)}
              >
                ถัดไป: จัดเรียงลำดับรูป <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 3: MOBILE + DESKTOP VISUAL IMAGE GRID ARRANGER
           ============================================================ */}
        {step === 3 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 3 · จัดเรียงลำดับรูปสกิน ({selectedSkins.length} รูป){' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  บนมือถือและคอม: แตะที่รูปแรกแล้วแตะรูปที่ต้องการสลับตำแหน่ง หรือกดค้างที่ปุ่มลูกศรเพื่อลากย้ายได้เลย
                </p>
              </div>

              <div className="autoSortToolbar">
                <button className="sortActionBtn" onClick={sortSkinsByHero}>
                  <Layers size={14} /> เรียงตามฮีโร่ (A → Z)
                </button>
                <button className="sortActionBtn" onClick={reverseSkinsOrder}>
                  สลับหน้า-หลัง
                </button>
              </div>
            </div>

            {/* Column Selector (1 to 20, Odd & Even) + Smart Recommendations */}
            <div className="columnConfiguratorBox">
              <div className="colConfigTopRow">
                <div className="colPickerLabelGroup">
                  <b>จำนวนรูปต่อแถว (1–20 รูป เลือกเลขคี่/เลขคู่ได้):</b>
                  <div className="colStepperControl">
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.max(1, (l.columns || 10) - 1),
                        }))
                      }
                      disabled={layout.columns <= 1}
                    >
                      −
                    </button>
                    <span className="tabular">{layout.columns} รูป/แถว</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.min(20, (l.columns || 10) + 1),
                        }))
                      }
                      disabled={layout.columns >= 20}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Smart Recommendations for current skin count */}
                {selectedSkins.length > 0 && (
                  <div className="colRecommendBar">
                    <span className="recBadgeLabel">
                      <Sparkles size={13} /> แนะนำสำหรับ {selectedSkins.length}{' '}
                      รูป:
                    </span>
                    <div className="recChipsWrap">
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
              </div>

              {/* All 1 to 20 number buttons */}
              <div className="allColsNumberRow">
                {ALL_COLUMN_OPTIONS.map((col) => {
                  const isRec = recommendedColsList.some(
                    (r) => r.cols === col && r.exact
                  );
                  return (
                    <button
                      key={col}
                      type="button"
                      className={
                        'colNumBtn tabular ' +
                        (layout.columns === col ? 'active ' : '') +
                        (isRec ? 'recommended ' : '')
                      }
                      onClick={() => setLayout({ ...layout, columns: col })}
                      title={
                        isRec
                          ? `${col} รูปต่อแถว (หารลงตัวพอดี)`
                          : `${col} รูปต่อแถว`
                      }
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile & Desktop Active Selection Action Bar */}
            <div
              className={
                'mobileSwapBanner ' + (activeArrangeItem ? 'hasSelection' : '')
              }
            >
              {activeArrangeItem ? (
                <div className="activeSwapControls">
                  <div className="activeSwapTitle">
                    <span className="swapBadge tabular">
                      กำลังเลือกรูปที่ #{selectedArrangeIdx + 1}
                    </span>
                    <b>{activeArrangeItem.name}</b>
                    <small>
                      (แตะที่รูปอื่นในตารางเพื่อสลับตำแหน่งกันทันที หรือใช้ปุ่มด้านขวา)
                    </small>
                  </div>
                  <div className="activeSwapBtns">
                    <button
                      type="button"
                      onClick={() => moveSkinToIndex(selectedArrangeIdx, 0)}
                      disabled={selectedArrangeIdx === 0}
                    >
                      ⏮ ไปแรกสุด
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelectedSkin(selectedArrangeIdx, -1)}
                      disabled={selectedArrangeIdx === 0}
                    >
                      ← เลื่อนซ้าย
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSelectedSkin(selectedArrangeIdx, 1)}
                      disabled={
                        selectedArrangeIdx === selectedSkins.length - 1
                      }
                    >
                      เลื่อนขวา →
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
                      ไปท้ายสุด ⏭
                    </button>
                    <button
                      type="button"
                      className="dangerSwapBtn"
                      onClick={() => {
                        const targetUid = activeArrangeItem.uid;
                        setSelectedSkins((prev) =>
                          prev.filter((x) => x.uid !== targetUid)
                        );
                        setSelectedArrangeIdx(null);
                      }}
                    >
                      ลบออก
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
              ) : (
                <div className="swapIdleHint">
                  <Move size={15} />
                  <span>
                    <b>วิธีสลับตำแหน่ง (รองรับมือถือ & คอม):</b> แตะที่รูปที่ต้องการย้าย 1 ครั้ง แล้วแตะรูปปลายทางเพื่อสลับที่กันทันที หรือแตะค้างที่ปุ่มมุมซ้ายบนของรูปเพื่อลากย้าย
                  </span>
                </div>
              )}
            </div>

            {/* Visual Arrange Grid */}
            <div
              className="visualArrangeGrid"
              onTouchMove={handleTouchDragMove}
              onTouchEnd={handleTouchDragEnd}
              style={{
                gridTemplateColumns: `repeat(${Math.min(layout.columns || 10, 10)}, minmax(0, 1fr))`,
              }}
            >
              {selectedSkins.map((item, i) => {
                const heroObj = heroesById[item.heroId];
                const imgSrc = item.image || heroObj?.image || '';
                const isSelectedForSwap = selectedArrangeIdx === i;

                return (
                  <div
                    key={item.uid}
                    data-arrange-index={i}
                    className={
                      'visualArrangeTile ' +
                      (dragIndex === i ? 'dragging ' : '') +
                      (isSelectedForSwap ? 'selectedForSwap ' : '')
                    }
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleTileTap(i)}
                    style={{
                      background:
                        heroObj?.color ||
                        PASTEL_PALETTE[i % PASTEL_PALETTE.length],
                    }}
                  >
                    {imgSrc && (
                      <img
                        src={imgSrc}
                        alt=""
                        referrerPolicy="no-referrer"
                        draggable={false}
                      />
                    )}

                    {/* Touch Drag Handle & Index Badge (Top-Left) */}
                    <div
                      className="touchDragHandle"
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        handleTouchDragStart(i);
                      }}
                      title="แตะค้างเพื่อลากสลับตำแหน่ง"
                    >
                      <Move size={11} />
                      <span className="tabular">#{i + 1}</span>
                    </div>

                    {isSelectedForSwap && (
                      <div className="swapSelectedOverlay">
                        <span>กำลังเลือก · แตะรูปอื่นเพื่อสลับ</span>
                      </div>
                    )}

                    <div
                      className="visualTileControls"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => moveSelectedSkin(i, -1)}
                        disabled={i === 0}
                        title="เลื่อนไปก่อนหน้า"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedSkin(i, 1)}
                        disabled={i === selectedSkins.length - 1}
                        title="เลื่อนไปถัดไป"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="removeTileBtn"
                        onClick={() => {
                          setSelectedSkins((prev) =>
                            prev.filter((x) => x.uid !== item.uid)
                          );
                          if (selectedArrangeIdx === i) {
                            setSelectedArrangeIdx(null);
                          }
                        }}
                        title="นำออก"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={16} /> กลับไปเลือกรูปเพิ่ม
              </button>
              <button
                className="primary"
                disabled={!selectedSkins.length}
                onClick={() => setStep(4)}
              >
                ดูพรีวิวตารางจริง & ดาวน์โหลด <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 4: PURE SEAMLESS COLLAGE PREVIEW & DOWNLOAD PNG
           ============================================================ */}
        {step === 4 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 4 · พรีวิวคอลเลกชันสกิน & ดาวน์โหลด PNG{' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  ภาพที่ได้จะมีเฉพาะรูปสกินเรียงต่อกันแบบไร้ขอบ ({selectedSkins.length}{' '}
                  รูป · แถวละ {layout.columns} รูป)
                </p>
              </div>

              <div className="previewQuickControls">
                <button
                  className="secondary"
                  onClick={handleSaveToCollection}
                >
                  <FolderHeart size={15} /> บันทึกเก็บไว้
                </button>

                <button
                  className="primary"
                  onClick={handleDownloadPng}
                  disabled={isExporting || !selectedSkins.length}
                >
                  <Download size={16} />{' '}
                  {isExporting ? 'กำลังสร้างไฟล์ภาพ...' : 'ดาวน์โหลด PNG'}
                </button>
              </div>
            </div>

            {/* Column Configurator & Smart Recommendation inside Preview too */}
            <div className="columnConfiguratorBox compactBox">
              <div className="colConfigTopRow">
                <div className="colPickerLabelGroup">
                  <b>จำนวนรูปต่อแถว (1–20):</b>
                  <div className="colStepperControl">
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.max(1, (l.columns || 10) - 1),
                        }))
                      }
                      disabled={layout.columns <= 1}
                    >
                      −
                    </button>
                    <span className="tabular">{layout.columns} รูป/แถว</span>
                    <button
                      type="button"
                      onClick={() =>
                        setLayout((l) => ({
                          ...l,
                          columns: Math.min(20, (l.columns || 10) + 1),
                        }))
                      }
                      disabled={layout.columns >= 20}
                    >
                      +
                    </button>
                  </div>
                </div>

                {selectedSkins.length > 0 && (
                  <div className="colRecommendBar">
                    <span className="recBadgeLabel">
                      <Sparkles size={13} /> แนะนำสำหรับ {selectedSkins.length}{' '}
                      รูป:
                    </span>
                    <div className="recChipsWrap">
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
              </div>

              <div className="allColsNumberRow">
                {ALL_COLUMN_OPTIONS.map((col) => {
                  const isRec = recommendedColsList.some(
                    (r) => r.cols === col && r.exact
                  );
                  return (
                    <button
                      key={col}
                      type="button"
                      className={
                        'colNumBtn tabular ' +
                        (layout.columns === col ? 'active ' : '') +
                        (isRec ? 'recommended ' : '')
                      }
                      onClick={() => setLayout({ ...layout, columns: col })}
                    >
                      {col}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pure Seamless Collage Canvas */}
            <div className="previewWrap">
              <PosterCanvas
                previewRef={previewRef}
                selectedSkins={selectedSkins}
                heroesById={heroesById}
                layout={layout}
              />
            </div>

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(3)}>
                <ArrowLeft size={16} /> กลับไปจัดเรียงลำดับรูป
              </button>
              <button
                className="primary"
                onClick={handleDownloadPng}
                disabled={isExporting || !selectedSkins.length}
              >
                <Download size={16} />{' '}
                {isExporting
                  ? 'กำลังสร้างไฟล์ภาพ...'
                  : 'ดาวน์โหลดภาพคอลเลกชัน PNG (High-Res)'}
              </button>
            </div>

            {savedPosters.length > 0 && (
              <div className="savedCollectionSection">
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
                          {entry.layout?.columns || 10} รูปต่อแถว
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
        )}
      </section>

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
