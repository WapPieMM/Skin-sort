import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Heart,
  Sparkles,
  Search,
  Download,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Upload,
  Link2,
  Plus,
  Trash2,
  SlidersHorizontal,
  ShieldCheck,
  Layers,
  Check,
  Image as ImageIcon,
  FolderHeart,
  Edit3,
} from 'lucide-react';
import {
  DEFAULT_HEROES,
  HERO_ROLES,
  POSTER_THEMES,
  RANK_OPTIONS,
  BIND_STATUS_OPTIONS,
  PASTEL_PALETTE,
} from './data/defaultCatalog';
import { compressImageFile } from './utils/imageHelper';
import HeroSkinModal from './components/HeroSkinModal';
import PosterCanvas from './components/PosterCanvas';
import { loadCatalogFromIndexedDB, saveCatalogToIndexedDB } from './utils/catalogStorage';

const CATALOG_STORAGE_KEY = 'rov_white_angel_catalog_v2';
const CATALOG_SKIN_MIGRATION_KEY = 'rov_white_angel_catalog_skins_cleared_v1';
const SAVED_POSTERS_KEY = 'rov_white_angel_saved_posters_v2';

export function App() {
  // 1. Hero & Skin Catalog State (Persisted in localStorage)
  const [heroes, setHeroes] = useState(() =>
    DEFAULT_HEROES.map((hero) => ({ ...hero, skins: [] }))
  );
  const [isCatalogLoaded, setIsCatalogLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      try {
        // IndexedDB supports much larger image collections than localStorage.
        const indexedCatalog = await loadCatalogFromIndexedDB();
        if (Array.isArray(indexedCatalog) && indexedCatalog.length > 0) {
          if (!cancelled) setHeroes(indexedCatalog);
          return;
        }

        // Migrate the existing localStorage catalog once.
        let parsed = [];
        try {
          const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
          parsed = saved ? JSON.parse(saved) : [];
        } catch {
          parsed = [];
        }

        const shouldClearLegacySkins =
          localStorage.getItem(CATALOG_SKIN_MIGRATION_KEY) !== 'done';
        const source = Array.isArray(parsed) && parsed.length
          ? parsed
          : DEFAULT_HEROES;
        const savedIds = new Set(source.map((hero) => hero.id));
        const newlyAddedDefaults = DEFAULT_HEROES.filter(
          (hero) => !savedIds.has(hero.id)
        );
        const migratedHeroes = source.map((hero) => ({
          ...hero,
          skins: shouldClearLegacySkins
            ? []
            : Array.isArray(hero.skins)
              ? hero.skins
              : [],
        }));
        const nextCatalog = [
          ...migratedHeroes,
          ...newlyAddedDefaults.map((hero) => ({ ...hero, skins: [] })),
        ];

        await saveCatalogToIndexedDB(nextCatalog);
        localStorage.setItem(CATALOG_SKIN_MIGRATION_KEY, 'done');
        if (!cancelled) setHeroes(nextCatalog);
      } catch (error) {
        // Retain compatibility with the old catalog if IndexedDB is unavailable.
        try {
          const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
          const parsed = saved ? JSON.parse(saved) : null;
          if (!cancelled && Array.isArray(parsed) && parsed.length) {
            setHeroes(parsed);
          }
        } catch {
          // Start with the default catalog.
        }
        if (!cancelled) {
          notify('เปิดพื้นที่จัดเก็บรูปภาพไม่สำเร็จ กรุณาลองใช้เบราว์เซอร์อื่น');
        }
      } finally {
        if (!cancelled) setIsCatalogLoaded(true);
      }
    };

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isCatalogLoaded) return;
    saveCatalogToIndexedDB(heroes).catch(() => {
      notify('บันทึกข้อมูลไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม กรุณาสำรองข้อมูล JSON');
    });
  }, [heroes, isCatalogLoaded]);

  const heroesById = useMemo(() => {
    const map = {};
    heroes.forEach((h) => {
      map[h.id] = h;
    });
    return map;
  }, [heroes]);

  // 2. Navigation & Step State
  const [step, setStep] = useState(1);
  const [activeHeroId, setActiveHeroId] = useState(() => heroes[0]?.id || 'alice');
  const activeHero = useMemo(
    () => heroes.find((h) => h.id === activeHeroId) || heroes[0],
    [heroes, activeHeroId]
  );

  // Modal state for full Hero & Skin database manager
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // 3. Selected Skin Queue
  const [selectedSkins, setSelectedSkins] = useState([]);

  // Sync any catalog edits (name/image) into currently selectedSkins
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
  const [roleFilter, setRoleFilter] = useState('All');
  const [skinQuery, setSkinQuery] = useState('');
  const [showAllHeroesSkins, setShowAllHeroesSkins] = useState(false);

  // Quick inline add skin state in Step 1 / Step 2
  const [quickSkinName, setQuickSkinName] = useState('');
  const [quickSkinImage, setQuickSkinImage] = useState('');

  // 5. Account Info, Watermark & Layout State (SortSkin Features)
  const [posterMode, setPosterMode] = useState('selling'); // 'selling' | 'collection' | 'showcase'
  const [accountInfo, setAccountInfo] = useState({
    title: 'Angel Collection · ไอดีหลักสกินแรร์จัดเต็ม',
    subtitle: 'รวมฮีโร่และข้อมูลไอดี พร้อมจัดทำป้ายประกาศ',
    accountCode: 'WA-001',
    price: '3,590',
    rank: RANK_OPTIONS[0],
    heroCount: '115',
    skinCount: '0',
    winRate: '64.8%',
    runeLevel: 'รูน Lv.3 ครบ 30 หน้า',
    bindStatus: BIND_STATUS_OPTIONS[0],
    contact: 'FB: White Angel Shop / Line: @whiteangel',
    note: 'นัดรับหรือผ่านกลางแอดมินได้ตลอด 24 ชม.',
  });

  const [watermark, setWatermark] = useState({
    enabled: true,
    text: 'WHITE ANGEL SHOP',
    subtext: 'ห้ามนำรูปไปใช้โดยไม่ได้รับอนุญาต',
    logo: '',
    style: 'tiled', // 'tiled' | 'center' | 'corner'
    opacity: 16,
  });

  const [layout, setLayout] = useState({
    columns: 5,
    cardShape: 'portrait', // 'portrait' | 'square' | 'compact'
    themeId: 'white-angel',
    showHeroName: true,
    showOrderNumber: true,
  });

  // Saved Posters Collection
  const [savedPosters, setSavedPosters] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_POSTERS_KEY);
      return raw ? JSON.parse(raw).map((poster) => ({ ...poster, selectedSkins: [], accountInfo: { ...poster.accountInfo, skinCount: '0' } })) : [];
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
  const [dragIndex, setDragIndex] = useState(null);

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

  const handleAddHero = ({ name, title, role, image, color }) => {
    const id =
      name.toLowerCase().replace(/[^a-z0-9]/g, '-') +
      '-' +
      Date.now().toString().slice(-4);
    const newHero = {
      id,
      name,
      title,
      role,
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
    const skinId = `${heroId}-skin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

  // Direct Inline Hero Image Upload in Step 1
  const handleInlineHeroImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeHero) return;
    try {
      const dataUrl = await compressImageFile(file, 440, 0.88);
      handleUpdateHero(activeHero.id, { image: dataUrl });
      notify(`อัปโหลดรูปภาพฮีโร่ ${activeHero.name} สำเร็จ!`);
    } catch {
      notify('ไม่สามารถอ่านไฟล์รูปภาพได้');
    }
    e.target.value = '';
  };

  // Direct Inline Quick Skin Image Upload
  const handleQuickSkinImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file, 460, 0.88);
      setQuickSkinImage(dataUrl);
      notify('เตรียมรูปสกินใหม่เรียบร้อย กดปุ่ม "+ เพิ่มสกิน" ได้เลย');
    } catch {
      notify('ไม่สามารถอ่านไฟล์รูปภาพสกินได้');
    }
    e.target.value = '';
  };

  const handleQuickAddSkinSubmit = (e) => {
    e.preventDefault();
    if (!quickSkinName.trim() || !activeHero) return;
    const created = handleAddSkin(activeHero.id, {
      name: quickSkinName.trim(),
      image: quickSkinImage.trim(),
    });
    // Also automatically select the newly added skin into the poster queue
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
    notify(`เพิ่มสกิน "${created.name}" ของ ${activeHero.name} และเลือกเข้าป้ายแล้ว`);
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
  };

  const sortSkinsByHero = () => {
    setSelectedSkins((prev) =>
      [...prev].sort((a, b) => {
        return a.heroName.localeCompare(b.heroName);
      })
    );
    notify('จัดเรียงสกินแยกตามชื่อฮีโร่ (A → Z) เรียบร้อย!');
  };

  const reverseSkinsOrder = () => {
    setSelectedSkins((prev) => [...prev].reverse());
    notify('สลับลำดับสกินหน้า-หลังเรียบร้อย');
  };

  // Drag and Drop reordering in Step 3
  const handleDragStart = (idx) => setDragIndex(idx);
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
  };
  const handleDragEnd = () => setDragIndex(null);

  // Filtered Hero List for Step 1
  const filteredHeroes = useMemo(() => {
    return heroes.filter((h) => {
      const matchesRole = roleFilter === 'All' || h.role === roleFilter;
      const matchesQuery =
        h.name.toLowerCase().includes(heroQuery.toLowerCase()) ||
        (h.title || '').toLowerCase().includes(heroQuery.toLowerCase());
      return matchesRole && matchesQuery;
    });
  }, [heroes, roleFilter, heroQuery]);

  // Filtered Skins for Step 2 (Either active hero or all heroes)
  const displayedSkinEntries = useMemo(() => {
    const sourceHeroes = showAllHeroesSkins ? heroes : activeHero ? [activeHero] : [];
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

  // Download PNG
  const handleDownloadPng = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(previewRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement('a');
      const fileSlug = (accountInfo.accountCode || 'rov-skin-poster')
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      a.download = `${fileSlug}.png`;
      a.href = dataUrl;
      a.click();
      notify('ดาวน์โหลดรูปภาพป้าย PNG ความละเอียดสูงสำเร็จ!');
    } catch {
      notify('เกิดข้อผิดพลาดในการสร้างไฟล์ภาพ กรุณาลองอีกครั้ง');
    } finally {
      setIsExporting(false);
    }
  };

  // Save current poster preset to My Collection
  const handleSaveToCollection = () => {
    const entry = {
      id: 'poster-' + Date.now(),
      savedAt: new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      posterMode,
      accountInfo: { ...accountInfo },
      watermark: { ...watermark },
      layout: { ...layout },
      selectedSkins: [],
    };
    const next = [entry, ...savedPosters];
    setSavedPosters(next);
    try {
      localStorage.setItem(SAVED_POSTERS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    notify('บันทึกป้ายนี้เก็บไว้ใน My Collection เรียบร้อยแล้ว ♡');
  };

  const handleLoadSavedPoster = (entry) => {
    setPosterMode(entry.posterMode || 'selling');
    if (entry.accountInfo) setAccountInfo(entry.accountInfo);
    if (entry.watermark) setWatermark(entry.watermark);
    if (entry.layout) setLayout(entry.layout);
    setSelectedSkins([]);
    setStep(5);
    notify(`โหลดป้าย "${entry.accountInfo?.title || 'Saved Poster'}" แล้ว`);
  };

  const handleDeleteSavedPoster = (id) => {
    const next = savedPosters.filter((p) => p.id !== id);
    setSavedPosters(next);
    try {
      localStorage.setItem(SAVED_POSTERS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <main className="app">
      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="floatingToast">
          <Sparkles size={15} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Navigation Bar (White Angel Theme) */}
      <header className="topbar">
        <div className="brand" onClick={() => setStep(1)} style={{ cursor: 'pointer' }}>
          <span className="brandmark">✧</span>
          <div>
            <b>RoV</b>
            <small>SORTSKIN · WHITE ANGEL</small>
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
            3. จัดเรียง & ข้อมูลขายไอดี
          </button>
          <button
            className={step === 5 ? 'active' : ''}
            onClick={() => setStep(5)}
          >
            5. พรีวิวป้าย & ดาวน์โหลด
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
          <span className="eyebrow">COLLECT · ARRANGE · SELL ACCOUNT POSTER</span>
          <h1>
            RoV Skin
            <br />
            <i>SortSkin Studio</i>
          </h1>
          <p>
            สร้างป้ายรวมสกินแรร์และป้ายโพสต์ขายไอดี RoV สไตล์ SortSkin
            <br />
            เพิ่มรูปภาพฮีโร่และสกินได้เอง จัดเรียงตามชื่อฮีโร่ พร้อมลายน้ำร้านค้า ♡
          </p>
          <div className="bannerBtnGroup">
            <button className="primary" onClick={() => setStep(2)}>
              เริ่มจัดเรียงสกินเลย <ArrowRight size={16} />
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
              WHITE ANGEL
              <br />
              SORTSKIN
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
            <span className="eyebrow">WHITE ANGEL SORTSKIN WORKSPACE</span>
            <h2>
              ระบบทำป้ายสกิน & โพสต์ขายไอดี <Sparkles size={20} />
            </h2>
          </div>

          <div className="steps">
            {[
              { n: 1, label: 'เลือกฮีโร่/ใส่รูป' },
              { n: 2, label: 'เลือกสกิน' },
              { n: 3, label: 'จัดเรียง/ข้อมูลไอดี' },
              { n: 4, label: 'ตั้งค่าตาราง' },
              { n: 5, label: 'พรีวิว/ดาวน์โหลด' },
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
                  Step 1 · เลือกฮีโร่ & ใส่ข้อมูลรูปภาพฮีโร่ <Sparkles size={15} />
                </h3>
                <p className="muted">
                  คลิกเลือกฮีโร่เพื่อใส่รูปภาพประจำตัวฮีโร่ เพิ่มสกิน หรือกดเลือกสกินเข้าป้ายได้ทันที
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setIsManagerOpen(true)}
              >
                <Plus size={15} /> เพิ่มฮีโร่ใหม่ / เปิดคลังข้อมูลทั้งหมด
              </button>
            </div>

            {/* Search & Role Filter Bar */}
            <div className="filterBarRow">
              <div className="search flex1">
                <Search size={17} />
                <input
                  placeholder="ค้นหาชื่อฮีโร่ (เช่น Alice, Violet, Lauriel, Allain)..."
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                />
              </div>

              <div className="rolePills">
                {HERO_ROLES.map((r) => (
                  <button
                    key={r.id}
                    className={
                      'filterTab ' + (roleFilter === r.id ? 'active' : '')
                    }
                    onClick={() => setRoleFilter(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hero Grid */}
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
                      <small>
                        {h.role} · {h.skins.length} สกิน
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DIRECT INLINE HERO IMAGE & DATA EDITOR ("ช่องสำหรับใส่ข้อมูลรูปภาพฮีโร่ตัวนั้น ๆ") */}
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
                    แก้ไขรูปสกินของ {activeHero.name} ทั้งหมด ({activeHero.skins.length})
                  </button>
                </div>

                <div className="heroInlineBody">
                  {/* Hero Image Preview + Upload Button */}
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

                  {/* Hero Data & Image URL Fields */}
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
                      <div className="fieldGroup">
                        <label>สายฮีโร่ (Role)</label>
                        <select
                          value={activeHero.role || 'Mage'}
                          onChange={(e) =>
                            handleUpdateHero(activeHero.id, {
                              role: e.target.value,
                            })
                          }
                        >
                          {HERO_ROLES.filter((r) => r.id !== 'All').map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
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

                    {/* Quick Add Skin for this Hero */}
                    <form
                      className="inlineQuickSkinForm"
                      onSubmit={handleQuickAddSkinSubmit}
                    >
                      <label>
                        <Plus size={13} /> เพิ่มสกินและรูปสกินใหม่ให้{' '}
                        <b>{activeHero.name}</b> ทันที:
                      </label>
                      <div className="quickSkinControls">
                        <input
                          placeholder="ชื่อสกิน (เช่น Dimension Breaker)"
                          value={quickSkinName}
                          onChange={(e) => setQuickSkinName(e.target.value)}
                          required
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
                <b className="tabular">{selectedSkins.length}</b> สกิน
              </span>
              <button className="primary" onClick={() => setStep(2)}>
                ไปเลือกสกินเข้าป้าย <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 2: SELECT SKINS ACROSS HEROES (SORTSKIN MULTI-HERO)
           ============================================================ */}
        {step === 2 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 2 · เลือกสกินเข้าป้าย (เลือกข้ามฮีโร่ได้เหมือน SortSkin){' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  คลิกเลือกสกินจากหลายฮีโร่เพื่อนำมารวมในป้ายเดียวกัน พร้อมกำหนดระดับความแรร์และใส่รูปสกินได้
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

            {/* Quick Hero Switcher Strip */}
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

            {/* Skin Search */}
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

            {/* Skin Grid */}
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

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> กลับไปเลือกฮีโร่/ใส่รูป
              </button>
              <div className="selectedSummaryInline">
                <span className="muted">
                  เลือกไว้แล้ว <b className="tabular">{selectedSkins.length}</b>{' '}
                  สกิน
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
                ถัดไป: จัดเรียง & ข้อมูลขายไอดี <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 3: SORTSKIN ARRANGER + ACCOUNT SELLING INFO + WATERMARK
           ============================================================ */}
        {step === 3 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 3 · จัดเรียงลำดับสกิน & กรอกข้อมูลโพสต์ขายไอดี{' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  กดปุ่มจัดเรียงตามระดับความแรร์อัตโนมัติ หรือลากสลับตำแหน่งสกิน พร้อมกรอกรายละเอียดไอดีและลายน้ำร้านค้า
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

            <div className="step3SplitLayout">
              {/* Left Column: Selected Skins Queue & Drag-and-Drop Reorder */}
              <div className="arrangeColumn">
                <div className="subPanelHeader">
                  <b>
                    ลำดับสกินในป้าย ({selectedSkins.length} สกิน) · ลากวางเพื่อสลับที่ได้
                  </b>
                  <button
                    className="tinyLinkBtn"
                    onClick={() => setStep(2)}
                  >
                    + เลือกสกินเพิ่ม
                  </button>
                </div>

                <div className="arrangeList">
                  {selectedSkins.map((item, i) => {
                    const heroObj = heroesById[item.heroId];
                    const imgSrc = item.image || heroObj?.image || '';

                    return (
                      <div
                        className={
                          'arrangeRow ' + (dragIndex === i ? 'dragging' : '')
                        }
                        key={item.uid}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragEnd={handleDragEnd}
                      >
                        <span className="num tabular">#{i + 1}</span>
                        <div
                          className="miniArt"
                          style={{
                            background:
                              heroObj?.color ||
                              PASTEL_PALETTE[i % PASTEL_PALETTE.length],
                          }}
                        >
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            item.name.slice(0, 1)
                          )}
                        </div>

                        <div className="arrangeItemInfo">
                          <b>{item.name}</b>
                          <small>{item.heroName}</small>
                        </div>

                        <div className="moveBtns">
                          <button
                            onClick={() => moveSelectedSkin(i, -1)}
                            disabled={i === 0}
                            title="เลื่อนขึ้น"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSelectedSkin(i, 1)}
                            disabled={i === selectedSkins.length - 1}
                            title="เลื่อนลง"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() =>
                              setSelectedSkins((prev) =>
                                prev.filter((x) => x.uid !== item.uid)
                              )
                            }
                            title="นำออกจากป้าย"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Account Selling Info + Shop Watermark */}
              <div className="accountConfigColumn">
                <div className="configCard">
                  <div className="configCardHeader">
                    <b>ข้อมูลป้ายโพสต์ขายไอดี / ชื่อคอลเลกชัน</b>
                    <div className="miniSegmented">
                      <button
                        className={posterMode === 'selling' ? 'active' : ''}
                        onClick={() => setPosterMode('selling')}
                      >
                        ป้ายขายไอดี
                      </button>
                      <button
                        className={posterMode === 'collection' ? 'active' : ''}
                        onClick={() => setPosterMode('collection')}
                      >
                        ป้ายโชว์สกิน
                      </button>
                    </div>
                  </div>

                  <div className="formGrid2">
                    <div className="fieldGroup fullWidth">
                      <label>หัวข้อป้าย / ชื่อคอลเลกชัน</label>
                      <input
                        value={accountInfo.title}
                        onChange={(e) =>
                          setAccountInfo({
                            ...accountInfo,
                            title: e.target.value,
                          })
                        }
                        placeholder="เช่น ไอดีหลักสกินแรร์จัดเต็ม พร้อมเล่น..."
                      />
                    </div>

                    <div className="fieldGroup fullWidth">
                      <label>คำโปรยรอง (Subtitle)</label>
                      <input
                        value={accountInfo.subtitle}
                        onChange={(e) =>
                          setAccountInfo({
                            ...accountInfo,
                            subtitle: e.target.value,
                          })
                        }
                        placeholder="รายละเอียดจุดเด่นสั้นๆ ใต้หัวข้อ..."
                      />
                    </div>

                    {posterMode === 'selling' && (
                      <>
                        <div className="fieldGroup">
                          <label>ราคาขาย (บาท)</label>
                          <input
                            value={accountInfo.price}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                price: e.target.value,
                              })
                            }
                            placeholder="เช่น 3,590"
                          />
                        </div>

                        <div className="fieldGroup">
                          <label>รหัสป้าย / รหัสสินค้า</label>
                          <input
                            value={accountInfo.accountCode}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                accountCode: e.target.value,
                              })
                            }
                            placeholder="เช่น WA-001"
                          />
                        </div>

                        <div className="fieldGroup">
                          <label>แรงค์ปัจจุบัน (Rank)</label>
                          <select
                            value={accountInfo.rank}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                rank: e.target.value,
                              })
                            }
                          >
                            {RANK_OPTIONS.map((rk) => (
                              <option key={rk} value={rk}>
                                {rk}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="fieldGroup">
                          <label>สถานะการผูกไอดี</label>
                          <select
                            value={accountInfo.bindStatus}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                bindStatus: e.target.value,
                              })
                            }
                          >
                            {BIND_STATUS_OPTIONS.map((bs) => (
                              <option key={bs} value={bs}>
                                {bs}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="fieldGroup">
                          <label>จำนวนฮีโร่ทั้งหมด</label>
                          <input
                            value={accountInfo.heroCount}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                heroCount: e.target.value,
                              })
                            }
                            placeholder="เช่น 115"
                          />
                        </div>

                        <div className="fieldGroup">
                          <label>จำนวนสกินทั้งหมดในไอดี</label>
                          <div className="inputWithBtn">
                            <input
                              value={accountInfo.skinCount}
                              onChange={(e) =>
                                setAccountInfo({
                                  ...accountInfo,
                                  skinCount: e.target.value,
                                })
                              }
                              placeholder="เช่น 340"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setAccountInfo({
                                  ...accountInfo,
                                  skinCount: String(selectedSkins.length),
                                })
                              }
                              title="ใช้จำนวนสกินที่เลือกในป้าย"
                            >
                              ={selectedSkins.length}
                            </button>
                          </div>
                        </div>

                        <div className="fieldGroup">
                          <label>อัตราชนะ (Win Rate)</label>
                          <input
                            value={accountInfo.winRate}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                winRate: e.target.value,
                              })
                            }
                            placeholder="เช่น 64.8%"
                          />
                        </div>

                        <div className="fieldGroup">
                          <label>รูน (Rune Info)</label>
                          <input
                            value={accountInfo.runeLevel}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                runeLevel: e.target.value,
                              })
                            }
                            placeholder="เช่น รูน Lv.3 ครบ 30 หน้า"
                          />
                        </div>

                        <div className="fieldGroup fullWidth">
                          <label>ช่องทางติดต่อสั่งซื้อ (FB / Line / เบอร์โทร)</label>
                          <input
                            value={accountInfo.contact}
                            onChange={(e) =>
                              setAccountInfo({
                                ...accountInfo,
                                contact: e.target.value,
                              })
                            }
                            placeholder="เช่น FB: White Angel Shop / Line: @whiteangel"
                          />
                        </div>
                      </>
                    )}

                    <div className="fieldGroup fullWidth">
                      <label>หมายเหตุเพิ่มเติมใต้ป้าย</label>
                      <input
                        value={accountInfo.note}
                        onChange={(e) =>
                          setAccountInfo({
                            ...accountInfo,
                            note: e.target.value,
                          })
                        }
                        placeholder="เช่น นัดรับหรือผ่านกลางแอดมินได้ตลอด 24 ชม."
                      />
                    </div>
                  </div>
                </div>

                {/* Watermark & Shop Credit Config */}
                <div className="configCard">
                  <div className="configCardHeader">
                    <b>
                      <ShieldCheck size={15} /> ลายน้ำเครดิตร้าน & ป้องกันขโมยรูป
                    </b>
                    <label className="toggleSwitchLabel">
                      <input
                        type="checkbox"
                        checked={watermark.enabled}
                        onChange={(e) =>
                          setWatermark({
                            ...watermark,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      <span>เปิดใช้ลายน้ำ</span>
                    </label>
                  </div>

                  <div className="formGrid2">
                    <div className="fieldGroup">
                      <label>ชื่อร้าน / เครดิตบนป้าย</label>
                      <input
                        value={watermark.text}
                        onChange={(e) =>
                          setWatermark({ ...watermark, text: e.target.value })
                        }
                        placeholder="เช่น WHITE ANGEL SHOP"
                      />
                    </div>

                    <div className="fieldGroup">
                      <label>ข้อความเตือนในลายน้ำ</label>
                      <input
                        value={watermark.subtext}
                        onChange={(e) =>
                          setWatermark({
                            ...watermark,
                            subtext: e.target.value,
                          })
                        }
                        placeholder="เช่น ห้ามนำรูปไปใช้"
                      />
                    </div>

                    <div className="fieldGroup">
                      <label>รูปแบบลายน้ำ</label>
                      <select
                        value={watermark.style}
                        onChange={(e) =>
                          setWatermark({ ...watermark, style: e.target.value })
                        }
                      >
                        <option value="tiled">คาดเฉียงทั่วป้าย (Anti-Theft)</option>
                        <option value="center">ตราประทับกลางป้าย (Center)</option>
                        <option value="corner">ป้ายเครดิตมุมภาพ (Corner)</option>
                      </select>
                    </div>

                    <div className="fieldGroup">
                      <label>
                        ความเข้มลายน้ำ ({watermark.opacity}%)
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="45"
                        value={watermark.opacity}
                        onChange={(e) =>
                          setWatermark({
                            ...watermark,
                            opacity: Number(e.target.value),
                          })
                        }
                      />
                    </div>

                    <div className="fieldGroup fullWidth">
                      <label>โลโก้ร้าน (แสดงมุมซ้ายบนของป้ายและลายน้ำ)</label>
                      <div className="logoUploadRow">
                        <input
                          value={watermark.logo}
                          onChange={(e) =>
                            setWatermark({ ...watermark, logo: e.target.value })
                          }
                          placeholder="วาง URL โลโก้ร้าน หรือกดอัปโหลดไฟล์..."
                        />
                        <label className="uploadLabelBtn">
                          <Upload size={13} /> อัปโหลดโลโก้
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const url = await compressImageFile(f, 240, 0.9);
                              setWatermark((w) => ({ ...w, logo: url }));
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {watermark.logo && (
                          <button
                            type="button"
                            className="clearImgBtn"
                            onClick={() =>
                              setWatermark({ ...watermark, logo: '' })
                            }
                          >
                            ลบโลโก้
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={16} /> กลับไปเลือกสกิน
              </button>
              <button
                className="primary"
                disabled={!selectedSkins.length}
                onClick={() => setStep(4)}
              >
                ถัดไป: เลือกรูปแบบตาราง & ธีมสี <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 4: POSTER MODE, COLUMNS & PASTEL THEME STUDIO
           ============================================================ */}
        {step === 4 && (
          <div className="panel">
            <h3>
              Step 4 · เลือกรูปแบบป้าย จำนวนคอลัมน์ และโทนสีพาสเทล{' '}
              <Sparkles size={15} />
            </h3>

            {/* 3 Main Poster Modes */}
            <div className="modeGrid">
              {[
                {
                  id: 'selling',
                  title: 'Account Selling Poster',
                  desc: 'ป้ายโพสต์ขายไอดีครบวงจร พร้อมแถบข้อมูลแรงค์ ราคา วินเรท และช่องทางติดต่อ',
                  icon: '♛',
                },
                {
                  id: 'collection',
                  title: 'Skin Collection Grid',
                  desc: 'ป้ายโชว์คอลเลกชันสกินเรียงเป็นตารางสวยงาม เน้นโชว์ภาพสกินและระดับความแรร์',
                  icon: '♡',
                },
                {
                  id: 'showcase',
                  title: 'Rare Skin Spotlight',
                  desc: 'ป้ายไฮไลต์สกินแรร์เฉพาะตัวโปรด จัดวางโดดเด่นสไตล์โปสเตอร์',
                  icon: '✧',
                },
              ].map((m, i) => (
                <button
                  key={m.id}
                  className={
                    'modeCard ' + (posterMode === m.id ? 'chosen' : '')
                  }
                  onClick={() => setPosterMode(m.id)}
                >
                  <div
                    className="modeArt"
                    style={{ background: PASTEL_PALETTE[i] }}
                  >
                    {m.icon}
                    <span>{selectedSkins.length} SKINS</span>
                  </div>
                  <b>{m.title}</b>
                  <small>{m.desc}</small>
                </button>
              ))}
            </div>

            {/* Layout & Theme Controls */}
            <div className="layoutStudioGrid">
              <div className="configCard">
                <b>
                  <SlidersHorizontal size={15} /> ตั้งค่าตารางสกิน (Grid & Card Layout)
                </b>
                <div className="formGrid2" style={{ marginTop: '12px' }}>
                  <div className="fieldGroup">
                    <label>จำนวนคอลัมน์ต่อแถว (Columns)</label>
                    <div className="colPickerBtns">
                      {[3, 4, 5, 6, 7, 8].map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={layout.columns === col ? 'active' : ''}
                          onClick={() => setLayout({ ...layout, columns: col })}
                        >
                          {col}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="fieldGroup">
                    <label>สัดส่วนกรอบรูปสกิน (Card Shape)</label>
                    <select
                      value={layout.cardShape}
                      onChange={(e) =>
                        setLayout({ ...layout, cardShape: e.target.value })
                      }
                    >
                      <option value="portrait">แนวตั้งมาตรฐาน (Portrait 3:4)</option>
                      <option value="square">สี่เหลี่ยมจัตุรัส (Square 1:1)</option>
                      <option value="compact">กะทัดรัดสำหรับสกินเยอะ (Compact)</option>
                    </select>
                  </div>
                </div>

                <div className="checkboxRowGroup">
                  <label className="toggleSwitchLabel">
                    <input
                      type="checkbox"
                      checked={layout.showHeroName}
                      onChange={(e) =>
                        setLayout({ ...layout, showHeroName: e.target.checked })
                      }
                    />
                    <span>แสดงชื่อฮีโร่ใต้ชื่อสกิน</span>
                  </label>

                  <label className="toggleSwitchLabel">
                    <input
                      type="checkbox"
                      checked={layout.showOrderNumber}
                      onChange={(e) =>
                        setLayout({
                          ...layout,
                          showOrderNumber: e.target.checked,
                        })
                      }
                    />
                    <span>แสดงตัวเลขลำดับ (#1, #2...)</span>
                  </label>
                </div>
              </div>

              <div className="configCard">
                <b>เลือกโทนสีพื้นหลังพาสเทล (White Angel Themes)</b>
                <div className="themeSwatchGrid">
                  {POSTER_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={
                        'themeSwatchBtn ' +
                        (layout.themeId === t.id ? 'active' : '')
                      }
                      onClick={() => setLayout({ ...layout, themeId: t.id })}
                    >
                      <span
                        className="swatchCircle"
                        style={{ background: t.gradient }}
                      />
                      <b>{t.name}</b>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(3)}>
                <ArrowLeft size={16} /> กลับไปจัดเรียง/ข้อมูลไอดี
              </button>
              <button className="primary" onClick={() => setStep(5)}>
                ดูพรีวิวป้ายจริง & ดาวน์โหลด <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
            STEP 5: LIVE POSTER PREVIEW, HIGH-RES PNG EXPORT & SAVED COLLECTION
           ============================================================ */}
        {step === 5 && (
          <div className="panel">
            <div className="panelTopRow">
              <div>
                <h3>
                  Step 5 · พรีวิวป้ายจริง & ดาวน์โหลด PNG ความละเอียดสูง{' '}
                  <Sparkles size={15} />
                </h3>
                <p className="muted">
                  สามารถปรับจำนวนคอลัมน์หรือสลับโหมดป้ายแบบเรียลไทม์ก่อนกดดาวน์โหลดได้เลย
                </p>
              </div>

              <div className="previewQuickControls">
                <div className="miniSegmented">
                  <button
                    className={posterMode === 'selling' ? 'active' : ''}
                    onClick={() => setPosterMode('selling')}
                  >
                    ป้ายขายไอดี
                  </button>
                  <button
                    className={posterMode === 'collection' ? 'active' : ''}
                    onClick={() => setPosterMode('collection')}
                  >
                    ป้ายโชว์สกิน
                  </button>
                </div>

                <select
                  value={layout.columns}
                  onChange={(e) =>
                    setLayout({ ...layout, columns: Number(e.target.value) })
                  }
                  className="compactSelect"
                >
                  {[3, 4, 5, 6, 7, 8].map((c) => (
                    <option key={c} value={c}>
                      ตาราง {c} คอลัมน์
                    </option>
                  ))}
                </select>

                <button
                  className="secondary"
                  onClick={handleSaveToCollection}
                >
                  <FolderHeart size={15} /> บันทึกป้ายไว้ในคอลเลกชัน
                </button>

                <button
                  className="primary"
                  onClick={handleDownloadPng}
                  disabled={isExporting}
                >
                  <Download size={16} />{' '}
                  {isExporting ? 'กำลังสร้างไฟล์ภาพ...' : 'ดาวน์โหลด PNG'}
                </button>
              </div>
            </div>

            {/* Live Poster Canvas */}
            <div className="previewWrap">
              <PosterCanvas
                previewRef={previewRef}
                selectedSkins={selectedSkins}
                heroesById={heroesById}
                posterMode={posterMode}
                accountInfo={accountInfo}
                watermark={watermark}
                layout={layout}
              />
            </div>

            <div className="bottomActions">
              <button className="secondary" onClick={() => setStep(4)}>
                <ArrowLeft size={16} /> กลับไปตั้งค่าตาราง
              </button>
              <button className="secondary" onClick={() => setStep(3)}>
                แก้ไขข้อมูลไอดี / ลำดับสกิน
              </button>
              <button
                className="primary"
                onClick={handleDownloadPng}
                disabled={isExporting}
              >
                <Download size={16} />{' '}
                {isExporting ? 'กำลังสร้างไฟล์ภาพ...' : 'ดาวน์โหลดป้าย PNG (High-Res)'}
              </button>
            </div>

            {/* Saved Posters Collection Section */}
            {savedPosters.length > 0 && (
              <div className="savedCollectionSection">
                <h4>
                  <FolderHeart size={17} /> คอลเลกชันป้ายที่บันทึกไว้ ({savedPosters.length})
                </h4>
                <div className="savedPostersGrid">
                  {savedPosters.map((entry) => (
                    <div key={entry.id} className="savedPosterItem">
                      <div>
                        <b>{entry.accountInfo?.title || 'RoV Skin Poster'}</b>
                        <small>
                          บันทึกเมื่อ {entry.savedAt} ·{' '}
                          {entry.selectedSkins?.length || 0} สกิน ·{' '}
                          {entry.posterMode === 'selling'
                            ? `ราคา ${entry.accountInfo?.price || '-'} ฿`
                            : 'Collection Mode'}
                        </small>
                      </div>
                      <div className="savedPosterActions">
                        <button
                          className="secondary"
                          onClick={() => handleLoadSavedPoster(entry)}
                        >
                          <Check size={14} /> โหลดป้ายนี้
                        </button>
                        <button
                          className="iconTrashBtn"
                          onClick={() => handleDeleteSavedPoster(entry.id)}
                          title="ลบป้ายที่บันทึกไว้"
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
        ♡ RoV Skin & Account Poster Generator{' '}
        <span>SortSkin System · White Angel Pastel Edition</span>
      </footer>
    </main>
  );
}

export default App;
