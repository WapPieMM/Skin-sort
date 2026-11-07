import React, { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Minimize2,
  Maximize2,
  Move,
  ZoomIn,
  ZoomOut,
  Download,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from 'lucide-react';
import { compressImageFile } from '../utils/imageHelper';

const SCRATCHPAD_STORAGE_KEY = 'rov_white_angel_floating_scratchpad_v1';

function loadSavedScratchpad() {
  try {
    const raw = localStorage.getItem(SCRATCHPAD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export default function FloatingScratchpad({
  onCaptureCurrentBoard,
  hasBoardSkins,
  notify,
}) {
  const saved = loadSavedScratchpad();

  const [isOpen, setIsOpen] = useState(() =>
    typeof saved?.isOpen === 'boolean' ? saved.isOpen : false
  );
  const [sizeMode, setSizeMode] = useState(() => saved?.sizeMode || 'm'); // 's' | 'm' | 'l'
  const [isTranslucent, setIsTranslucent] = useState(false);
  const [items, setItems] = useState(() =>
    Array.isArray(saved?.items) ? saved.items : []
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isCapturing, setIsCapturing] = useState(false);

  // Floating position (x, y from top-left of viewport)
  const [pos, setPos] = useState(() => {
    if (
      saved?.pos &&
      typeof saved.pos.x === 'number' &&
      typeof saved.pos.y === 'number'
    ) {
      return {
        x: Math.max(8, Math.min(window.innerWidth - 180, saved.pos.x)),
        y: Math.max(8, Math.min(window.innerHeight - 80, saved.pos.y)),
      };
    }
    return {
      x: Math.max(12, (typeof window !== 'undefined' ? window.innerWidth : 400) - 210),
      y: Math.max(70, (typeof window !== 'undefined' ? window.innerHeight : 700) - 90),
    };
  });

  const containerRef = useRef(null);
  const dragStateRef = useRef(null);
  const panStateRef = useRef(null);
  const fileInputRef = useRef(null);

  const safeActiveIndex =
    items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);
  const activeItem = items[safeActiveIndex] || null;

  // Persist items & state in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        SCRATCHPAD_STORAGE_KEY,
        JSON.stringify({
          isOpen,
          sizeMode,
          pos,
          items,
        })
      );
    } catch {
      // If quota exceeded, keep latest items that fit
      try {
        localStorage.setItem(
          SCRATCHPAD_STORAGE_KEY,
          JSON.stringify({
            isOpen,
            sizeMode,
            pos,
            items: items.slice(-4),
          })
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, [isOpen, sizeMode, pos, items]);

  // Keep floating window inside viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - 140, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - 60, prev.y)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Support pasting images directly from clipboard when open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = async (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      const imageFiles = [];
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        await addImageFiles(imageFiles, 'รูปที่วางจากคลิปบอร์ด');
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Reset zoom/pan when switching active image
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [safeActiveIndex]);

  const addImageFiles = async (fileList, defaultPrefix = 'รูปบันทึกชั่วคราว') => {
    const files = Array.from(fileList || []).filter((f) =>
      f.type?.startsWith('image/')
    );
    if (!files.length) return;

    const added = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const dataUrl = await compressImageFile(files[i], 1280, 0.9);
        added.push({
          id: `scratch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title:
            files[i].name?.replace(/\.[^.]+$/, '') ||
            `${defaultPrefix} #${items.length + i + 1}`,
          note: '',
          src: dataUrl,
          createdAt: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
      } catch {
        // Skip unreadable file
      }
    }

    if (added.length > 0) {
      setItems((prev) => {
        const next = [...prev, ...added];
        setActiveIndex(next.length - 1);
        return next;
      });
      setIsOpen(true);
      notify?.(`เพิ่มรูปเข้าแผ่นพักรูปชั่วคราว ${added.length} รูปแล้ว`);
    }
  };

  const handleCaptureBoard = async () => {
    if (!onCaptureCurrentBoard || isCapturing) return;
    setIsCapturing(true);
    try {
      const result = await onCaptureCurrentBoard();
      if (result?.dataUrl) {
        const newItem = {
          id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: result.title || `ตารางสกิน (${result.count || 0} รูป)`,
          note: '',
          src: result.dataUrl,
          createdAt: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        setItems((prev) => {
          const next = [...prev, newItem];
          setActiveIndex(next.length - 1);
          return next;
        });
        setIsOpen(true);
        notify?.('บันทึกภาพตารางสกินปัจจุบันเข้าหน้าต่างลอยแล้ว');
      }
    } catch (err) {
      notify?.(err?.message || 'ไม่สามารถแคปภาพตารางได้');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemoveItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleClearAll = () => {
    setItems([]);
    setActiveIndex(0);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    notify?.('ล้างรูปในหน้าต่างลอยทั้งหมดแล้ว');
  };

  const handleUpdateNote = (noteText) => {
    if (!activeItem) return;
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === safeActiveIndex ? { ...it, note: noteText } : it
      )
    );
  };

  const handleDownloadActive = () => {
    if (!activeItem?.src) return;
    const a = document.createElement('a');
    a.href = activeItem.src;
    a.download = `${activeItem.title || 'scratchpad-image'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // --- Pointer Drag for moving the Floating UI anywhere on screen ---
  const handleDragPointerDown = (e) => {
    if (e.button && e.button !== 0) return;
    if (e.target?.closest?.('[data-no-drag="true"]')) return;

    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
    };
  };

  const handleDragPointerMove = (e) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < 4) return;
    state.moved = true;

    const boxWidth = containerRef.current?.offsetWidth || 220;
    const boxHeight = containerRef.current?.offsetHeight || 56;
    const maxX = Math.max(8, window.innerWidth - Math.min(boxWidth, 120));
    const maxY = Math.max(8, window.innerHeight - Math.min(boxHeight, 56));

    const nextX = Math.max(6, Math.min(maxX, state.originX + dx));
    const nextY = Math.max(6, Math.min(maxY, state.originY + dy));

    setPos({ x: nextX, y: nextY });
  };

  const handleDragPointerUp = (e) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    const wasMoved = state.moved;
    dragStateRef.current = null;

    // If minimized pill was tapped without dragging, open the panel
    if (!isOpen && !wasMoved) {
      // Ensure expanded panel fits inside screen when opening near right/bottom edge
      const panelW = 320;
      const panelH = 420;
      setPos((prev) => ({
        x: Math.max(8, Math.min(window.innerWidth - panelW - 8, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - panelH - 8, prev.y)),
      }));
      setIsOpen(true);
    }
  };

  // --- Pointer Pan inside zoomed image ---
  const handleImagePanDown = (e) => {
    if (zoom <= 1) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    panStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  };

  const handleImagePanMove = (e) => {
    const state = panStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    setPan({
      x: Math.max(-240, Math.min(240, state.originX + dx)),
      y: Math.max(-240, Math.min(240, state.originY + dy)),
    });
  };

  const handleImagePanUp = (e) => {
    const state = panStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    panStateRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={
        'floatingScratchpadRoot ' +
        (isOpen ? `open size-${sizeMode} ` : 'minimized ') +
        (isTranslucent ? 'translucent ' : '')
      }
      style={{
        transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          addImageFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {!isOpen ? (
        /* Minimized Draggable Floating Pill */
        <div
          className="floatingScratchpadPill"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerCancel={handleDragPointerUp}
          title="แตะเพื่อเปิดสมุดพักรูปชั่วคราว หรือแตะค้างเพื่อลากไปวางจุดไหนก็ได้"
        >
          <span className="floatingPillDragIcon">
            <Move size={13} />
          </span>
          <ImageIcon size={15} />
          <b>พักรูปชั่วคราว</b>
          {items.length > 0 && (
            <span className="floatingPillCount tabular">{items.length}</span>
          )}
          <Maximize2 size={13} className="floatingPillExpandIcon" />
        </div>
      ) : (
        /* Expanded Movable Floating Panel */
        <div className="floatingScratchpadWindow">
          {/* Draggable Header Bar */}
          <div
            className="floatingScratchpadHeader"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerUp}
          >
            <div className="floatingHeaderTitle">
              <Move size={13} className="dragGripIcon" />
              <span>📌 สมุดพักรูปชั่วคราว</span>
              {items.length > 0 && (
                <small className="tabular">
                  ({safeActiveIndex + 1}/{items.length})
                </small>
              )}
            </div>

            <div className="floatingHeaderActions" data-no-drag="true">
              {/* Size Switcher S / M / L */}
              <div className="floatingSizeGroup" title="ปรับขนาดหน้าต่างลอย">
                {['s', 'm', 'l'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={
                      'floatingSizeBtn ' + (sizeMode === sz ? 'active' : '')
                    }
                    onClick={() => setSizeMode(sz)}
                  >
                    {sz.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={
                  'floatingIconBtn ' + (isTranslucent ? 'active' : '')
                }
                onClick={() => setIsTranslucent((v) => !v)}
                title="ปรับความโปร่งแสงเพื่อมองทะลุข้างหลัง"
              >
                <Eye size={13} />
              </button>

              <button
                type="button"
                className="floatingIconBtn"
                onClick={() => setIsOpen(false)}
                title="ย่อหน้าต่างลอยเก็บไว้"
              >
                <Minimize2 size={13} />
              </button>
            </div>
          </div>

          {/* Quick Action Toolbar (Upload Image / Snapshot Current Board) */}
          <div className="floatingScratchpadToolbar">
            <button
              type="button"
              className="floatingActionBtn primaryAction"
              onClick={() => fileInputRef.current?.click()}
              title="เพิ่มรูปแคปหน้าจอหรือรูปอ้างอิงจากเครื่อง (เลือกได้หลายรูป)"
            >
              <Plus size={13} /> เพิ่มรูปอ้างอิง
            </button>

            <button
              type="button"
              className="floatingActionBtn"
              onClick={handleCaptureBoard}
              disabled={!hasBoardSkins || isCapturing}
              title="ถ่ายภาพตารางสกินที่จัดอยู่ตอนนี้เก็บไว้ในหน้าต่างลอยชั่วคราว"
            >
              <Camera size={13} />{' '}
              {isCapturing ? 'กำลังแคป...' : 'แคปตารางนี้เก็บไว้'}
            </button>

            {items.length > 0 && (
              <button
                type="button"
                className="floatingActionBtn dangerAction"
                onClick={handleClearAll}
                title="ล้างรูปทั้งหมดในหน้าต่างลอย"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>

          {/* Image Stage or Dropzone */}
          {items.length === 0 ? (
            <div
              className="floatingEmptyDropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer?.files?.length) {
                  addImageFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon size={26} />
              <b>แตะเพื่อใส่รูปบันทึกชั่วคราว</b>
              <p>
                ใส่รูปแคปหน้าจอสกินในเกมไว้ดูเทียบตอนเลือกสกิน หรือกด{' '}
                <b>"แคปตารางนี้เก็บไว้"</b> เพื่อพักรูปตารางไว้เทียบกันได้ (วางรูป{' '}
                <code>Ctrl+V</code> ได้)
              </p>
            </div>
          ) : (
            <div className="floatingViewerBody">
              <div
                className={
                  'floatingImageStage ' + (zoom > 1 ? 'canPan' : '')
                }
                onPointerDown={handleImagePanDown}
                onPointerMove={handleImagePanMove}
                onPointerUp={handleImagePanUp}
                onPointerCancel={handleImagePanUp}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer?.files?.length) {
                    addImageFiles(e.dataTransfer.files);
                  }
                }}
              >
                {activeItem && (
                  <img
                    src={activeItem.src}
                    alt={activeItem.title || ''}
                    draggable={false}
                    style={{
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    }}
                  />
                )}

                {/* Prev / Next Overlay Arrows when multiple images */}
                {items.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="floatingNavArrow prev"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveIndex(
                          (safeActiveIndex - 1 + items.length) % items.length
                        );
                      }}
                      title="รูปก่อนหน้า"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="floatingNavArrow next"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveIndex((safeActiveIndex + 1) % items.length);
                      }}
                      title="รูปถัดไป"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}

                {/* Top-right Delete Single Image */}
                {activeItem && (
                  <button
                    type="button"
                    className="floatingStageDeleteBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveItem(activeItem.id);
                    }}
                    title="ลบรูปนี้ออกจากหน้าต่างลอย"
                  >
                    <X size={13} />
                  </button>
                )}

                {/* Bottom Zoom & Download Overlay Bar */}
                <div
                  className="floatingStageControls"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => {
                        const next = Math.max(1, Number((z - 0.5).toFixed(1)));
                        if (next === 1) setPan({ x: 0, y: 0 });
                        return next;
                      })
                    }
                    disabled={zoom <= 1}
                    title="ซูมออก"
                  >
                    <ZoomOut size={12} />
                  </button>
                  <span
                    className="tabular zoomLabel"
                    onClick={() => {
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    title="แตะเพื่อรีเซ็ตซูม 1x"
                  >
                    {zoom}x
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))))
                    }
                    disabled={zoom >= 3}
                    title="ซูมเข้า (ซูมแล้วใช้นิ้วเลื่อนดูรูปได้)"
                  >
                    <ZoomIn size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadActive}
                    title="ดาวน์โหลดรูปนี้"
                  >
                    <Download size={12} />
                  </button>
                </div>
              </div>

              {/* Thumbnail Strip when multiple images exist */}
              {items.length > 1 && (
                <div className="floatingThumbStrip">
                  {items.map((it, idx) => (
                    <button
                      key={it.id}
                      type="button"
                      className={
                        'floatingThumbItem ' +
                        (idx === safeActiveIndex ? 'active' : '')
                      }
                      onClick={() => setActiveIndex(idx)}
                      title={it.title}
                    >
                      <img src={it.src} alt="" draggable={false} />
                      <span className="tabular">{idx + 1}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Note Input for the active image */}
              {activeItem && (
                <div className="floatingNoteRow">
                  <input
                    type="text"
                    value={activeItem.note || ''}
                    onChange={(e) => handleUpdateNote(e.target.value)}
                    placeholder="จดโน้ตสั้นๆ กำกับรูปนี้..."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
