import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Search,
  Sparkles,
  Check,
  Trash2,
  RefreshCw,
  Image as ImageIcon,
  Sliders,
} from 'lucide-react';
import {
  buildCatalogSkinIndex,
  scanScreenshotForSkins,
} from '../utils/skinScanner';

export default function SkinScannerModal({
  isOpen,
  onClose,
  heroes,
  onImportMatchedSkins,
  notify,
}) {
  const [gridMode, setGridMode] = useState('auto'); // 'auto' | '5x3' | '5x2'
  const [matchThreshold, setMatchThreshold] = useState(64);
  const [appendMode, setAppendMode] = useState('append'); // 'append' | 'replace'

  const [catalogIndex, setCatalogIndex] = useState([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);

  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [scanResults, setScanResults] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // Active slot ID for manual skin picker popover
  const [manualPickerSlotId, setManualPickerSlotId] = useState(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  const fileInputRef = useRef(null);

  // Count total catalog skins available
  const totalCatalogSkins = useMemo(() => {
    return (heroes || []).reduce(
      (sum, h) => sum + (Array.isArray(h.skins) ? h.skins.length : 0),
      0
    );
  }, [heroes]);

  // Flat list of all catalog skins for manual override search
  const allCatalogSkins = useMemo(() => {
    const list = [];
    for (const hero of heroes || []) {
      for (const skin of hero.skins || []) {
        const imgSrc = skin.image || hero.image || '';
        if (imgSrc) {
          list.push({
            heroId: hero.id,
            heroName: hero.name,
            skinId: skin.id,
            skinName: skin.name,
            image: imgSrc,
          });
        }
      }
    }
    return list;
  }, [heroes]);

  const filteredManualSkins = useMemo(() => {
    const q = manualSearchQuery.trim().toLowerCase();
    if (!q) return allCatalogSkins.slice(0, 48);
    return allCatalogSkins
      .filter(
        (item) =>
          item.skinName.toLowerCase().includes(q) ||
          item.heroName.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [allCatalogSkins, manualSearchQuery]);

  // Build catalog index whenever modal opens or heroes change
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const prepareIndex = async () => {
      setIsIndexing(true);
      setIndexProgress(0);
      try {
        const indexed = await buildCatalogSkinIndex(heroes, (pct) => {
          if (!cancelled) setIndexProgress(pct);
        });
        if (!cancelled) {
          setCatalogIndex(indexed);
          setIndexProgress(100);
        }
      } catch {
        if (!cancelled) setCatalogIndex([]);
      } finally {
        if (!cancelled) setIsIndexing(false);
      }
    };

    prepareIndex();
    return () => {
      cancelled = true;
    };
  }, [isOpen, heroes]);

  // Run scan whenever uploadedFiles or gridMode changes (and catalogIndex is ready)
  useEffect(() => {
    if (!isOpen || isIndexing || uploadedFiles.length === 0) return;
    let cancelled = false;

    const runBatchScan = async () => {
      setIsScanning(true);
      try {
        const results = [];
        for (let i = 0; i < uploadedFiles.length; i++) {
          const res = await scanScreenshotForSkins({
            file: uploadedFiles[i],
            catalogIndex,
            gridMode,
            matchThreshold,
          });
          results.push({
            ...res,
            batchIndex: i,
          });
        }
        if (!cancelled) {
          setScanResults(results);
        }
      } catch (err) {
        if (!cancelled && notify) {
          notify(err?.message || 'เกิดข้อผิดพลาดขณะสแกนรูปภาพ');
        }
      } finally {
        if (!cancelled) setIsScanning(false);
      }
    };

    runBatchScan();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isIndexing, uploadedFiles, gridMode, catalogIndex]);

  // Dynamically re-evaluate threshold on existing scanResults when slider moves
  const handleThresholdChange = (newThreshold) => {
    setMatchThreshold(newThreshold);
    setScanResults((prev) =>
      prev.map((page) => ({
        ...page,
        slots: page.slots.map((slot) => {
          if (slot.isManualOverride) return slot;
          const topMatch = slot.candidates?.[0] || null;
          const meets = Boolean(topMatch && topMatch.score >= newThreshold);
          return {
            ...slot,
            included: meets,
            selectedMatch: meets ? topMatch : null,
          };
        }),
      }))
    );
  };

  // Support Ctrl+V paste while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        setUploadedFiles((prev) => [...prev, ...files]);
        notify?.(`วางภาพแคปหน้าจอ ${files.length} รูปเพื่อสแกนแล้ว`);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, notify]);

  // Summary counts across all scanned screenshots
  const summaryStats = useMemo(() => {
    let totalSlots = 0;
    let matchedCount = 0;
    let skippedCount = 0;
    const matchedItems = [];

    for (const page of scanResults) {
      for (const slot of page.slots) {
        totalSlots++;
        if (slot.included && slot.selectedMatch) {
          matchedCount++;
          matchedItems.push(slot.selectedMatch);
        } else {
          skippedCount++;
        }
      }
    }
    return {
      totalSlots,
      matchedCount,
      skippedCount,
      matchedItems,
    };
  }, [scanResults]);

  if (!isOpen) return null;

  const handleFilesSelected = (fileList) => {
    const valid = Array.from(fileList || []).filter((f) =>
      f.type.startsWith('image/')
    );
    if (!valid.length) return;
    setUploadedFiles((prev) => [...prev, ...valid]);
  };

  const handleToggleSlotIncluded = (pageIdx, slotId) => {
    setScanResults((prev) =>
      prev.map((page, pIdx) => {
        if (pIdx !== pageIdx) return page;
        return {
          ...page,
          slots: page.slots.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            const nextIncluded = !slot.included;
            const fallbackMatch =
              slot.selectedMatch || slot.candidates?.[0] || null;
            return {
              ...slot,
              included: nextIncluded && Boolean(fallbackMatch),
              selectedMatch: nextIncluded ? fallbackMatch : slot.selectedMatch,
              isManualOverride: true,
            };
          }),
        };
      })
    );
  };

  const handleSelectCandidateForSlot = (pageIdx, slotId, candidate) => {
    setScanResults((prev) =>
      prev.map((page, pIdx) => {
        if (pIdx !== pageIdx) return page;
        return {
          ...page,
          slots: page.slots.map((slot) => {
            if (slot.slotId !== slotId) return slot;
            if (!candidate) {
              return {
                ...slot,
                included: false,
                selectedMatch: null,
                isManualOverride: true,
              };
            }
            return {
              ...slot,
              included: true,
              selectedMatch: {
                ...candidate,
                score: candidate.score ?? 100,
              },
              isManualOverride: true,
            };
          }),
        };
      })
    );
    setManualPickerSlotId(null);
  };

  const handleRemoveScreenshotPage = (pageIdx) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== pageIdx));
    setScanResults((prev) => prev.filter((_, i) => i !== pageIdx));
  };

  const handleClearAllScreenshots = () => {
    setUploadedFiles([]);
    setScanResults([]);
    setManualPickerSlotId(null);
  };

  const handleConfirmImport = () => {
    if (!summaryStats.matchedItems.length) {
      notify?.('ยังไม่มีสกินที่เลือกนำเข้า กรุณาติ๊กเลือกอย่างน้อย 1 ใบ');
      return;
    }
    onImportMatchedSkins(summaryStats.matchedItems, appendMode === 'replace');
    onClose();
  };

  return (
    <div
      className="modalBackdrop skinScannerModalBackdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modalCard skinScannerModalCard">
        {/* Modal Header */}
        <div className="modalHeader skinScannerHeader">
          <div>
            <span className="eyebrow">
              AI BADGE-MASKED SKIN DETECTOR · 5×3 (15 ใบ) & 5×2 (10 ใบ)
            </span>
            <h3>
              <Sparkles size={18} /> สแกนรูปแคปหน้าจอ RoV & แมตช์สกินเข้าพรีวิว
            </h3>
          </div>

          <div className="modalHeaderActions">
            <span className="scannerCatalogCountBadge tabular">
              สกินในคลังเว็บ: <b>{totalCatalogSkins}</b> ใบ
            </span>
            <button
              type="button"
              className="iconCloseBtn"
              onClick={onClose}
              title="ปิดหน้าต่าง"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top Configuration & Explanation Bar */}
        <div className="scannerTopControlBar">
          <div className="scannerControlGroup">
            <label className="scannerControlLabel">รูปแบบตารางในภาพ:</label>
            <div className="scannerModePills">
              {[
                { id: 'auto', label: 'อัตโนมัติ (5×3 / 5×2)' },
                { id: '5x3', label: '5×3 (15 ใบ · รวมแถว 3 ครึ่งใบ)' },
                { id: '5x2', label: '5×2 (10 ใบ)' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    'scannerModePillBtn ' + (gridMode === m.id ? 'active' : '')
                  }
                  onClick={() => setGridMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="scannerControlGroup">
            <label className="scannerControlLabel">
              <Sliders size={13} /> เกณฑ์ความเหมือนขั้นต่ำ:{' '}
              <b className="tabular">{matchThreshold}%</b>
            </label>
            <input
              type="range"
              min={45}
              max={85}
              step={1}
              value={matchThreshold}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="scannerThresholdSlider"
              title="หากความเหมือนต่ำกว่าเกณฑ์นี้ ระบบจะข้ามใบที่ไม่มีในคลังเว็บให้อัตโนมัติ"
            />
          </div>

          <div className="scannerUploadQuickBtns">
            <label className="primary scannerUploadLabelBtn">
              <Upload size={14} /> อัปโหลดภาพแคปหน้าจอ (เลือกหลายรูปได้)
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>

            {uploadedFiles.length > 0 && (
              <button
                type="button"
                className="secondary scannerClearBtn"
                onClick={handleClearAllScreenshots}
              >
                <Trash2 size={14} /> ล้างรูปที่สแกน
              </button>
            )}
          </div>
        </div>

        {/* Feature Highlight Banner */}
        <div className="scannerInfoStrip">
          <span>
            🛡️ <b>ทนทานต่อป้ายบัง 100%:</b> ระบบตัดส่วนป้ายคอลแลปมุมขวาบน (เช่น{' '}
            <i>Attack on Titan, Jujutsu Kaisen, Limited, Mythical</i>) และชื่อด้านล่างออกก่อนเปรียบเทียบใบหน้า/ชุดตัวละคร ·{' '}
            <b>ใบที่ไม่มีในคลังเว็บจะถูกข้ามให้อัตโนมัติ</b>
          </span>
        </div>

        {/* Main Scrollable Body */}
        <div className="skinScannerModalBody">
          {totalCatalogSkins === 0 && (
            <div className="scannerWarningBanner">
              ⚠️ <b>คลังสกินในเว็บยังไม่มีรูปภาพสกิน:</b> กรุณาเพิ่มรูปสกินเข้าคลังฮีโร่ก่อน ระบบจึงจะสามารถนำภาพจากเกมมาเปรียบเทียบกับรูปสกินในเว็บได้
            </div>
          )}

          {isIndexing && (
            <div className="scannerLoadingState">
              <RefreshCw size={24} className="spinIcon" />
              <b>กำลังเตรียมดัชนีภาพสกินในคลัง ({indexProgress}%)...</b>
              <p>ระบบกำลังตัดป้ายมุมขวาบนและคำนวณจุดเด่นของสกินทั้งหมดในเว็บ</p>
            </div>
          )}

          {!isIndexing && uploadedFiles.length === 0 && (
            <div
              className="scannerDropzoneBox"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelected(e.dataTransfer?.files);
              }}
            >
              <div className="scannerDropzoneIcon">
                <ImageIcon size={34} />
              </div>
              <h4>
                คลิกเพื่อเลือกรูปแคปหน้าจอ RoV หรือลากไฟล์มาวางที่นี่ (กด Ctrl+V เพื่อวางได้)
              </h4>
              <p>
                รองรับภาพหน้าฮีโร่และหน้าสกินแบบ <b>5×3 (15 ใบ รวมแถวล่างครึ่งใบ)</b>{' '}
                และ <b>5×2 (10 ใบ)</b> · อัปโหลดพร้อมกันหลายภาพได้เลย
              </p>
              <div className="scannerZoneDiagram">
                <span className="zoneTag ignored">
                  ✗ ข้ามป้ายมุมขวาบน (Collab / Tier)
                </span>
                <span className="zoneTag matched">
                  ✓ เทียบโซนกลางภาพ (ใบหน้า & ชุดตัวละคร)
                </span>
                <span className="zoneTag ignored">
                  ✗ ข้ามชื่อฮีโร่ & แต้มความชำนาญด้านล่าง
                </span>
              </div>
            </div>
          )}

          {isScanning && (
            <div className="scannerLoadingState">
              <RefreshCw size={24} className="spinIcon" />
              <b>กำลังตัดแบ่งการ์ด 15 ใบ และแมตช์กับคลังสกินในเว็บ...</b>
              <p>กำลังประมวลผลด้วยอัลกอริทึม Core Artwork & Outlier Trimming</p>
            </div>
          )}

          {!isScanning &&
            scanResults.map((page, pageIdx) => {
              const pageMatchedCount = page.slots.filter(
                (s) => s.included && s.selectedMatch
              ).length;
              const pageSkippedCount = page.slots.length - pageMatchedCount;

              return (
                <div key={`${page.fileName}_${pageIdx}`} className="scannerPageSection">
                  <div className="scannerPageHeader">
                    <div className="scannerPageTitleLeft">
                      <img
                        src={page.screenshotUrl}
                        alt={page.fileName}
                        className="scannerPageMiniPreview"
                      />
                      <div>
                        <b>
                          ภาพที่ #{pageIdx + 1}: {page.fileName}
                        </b>
                        <small className="tabular">
                          ตรวจพบตาราง 5×{page.detectedRows} ({page.totalSlots}{' '}
                          ใบ) · แมตช์เจอในคลัง{' '}
                          <strong className="textSuccess">
                            {pageMatchedCount} ใบ
                          </strong>{' '}
                          · ข้ามใบที่ไม่มีในคลัง{' '}
                          <strong className="textMuted">
                            {pageSkippedCount} ใบ
                          </strong>
                        </small>
                      </div>
                    </div>

                    <div className="scannerPageHeaderActions">
                      <button
                        type="button"
                        className="scannerMiniTextBtn"
                        onClick={() => {
                          setScanResults((prev) =>
                            prev.map((p, idx) =>
                              idx !== pageIdx
                                ? p
                                : {
                                    ...p,
                                    slots: p.slots.map((s) => {
                                      const fallback =
                                        s.selectedMatch ||
                                        s.candidates?.[0] ||
                                        null;
                                      return {
                                        ...s,
                                        included: Boolean(fallback),
                                        selectedMatch: fallback,
                                        isManualOverride: true,
                                      };
                                    }),
                                  }
                            )
                          );
                        }}
                      >
                        เลือกทุกใบในภาพนี้
                      </button>
                      <button
                        type="button"
                        className="scannerMiniTextBtn danger"
                        onClick={() => handleRemoveScreenshotPage(pageIdx)}
                      >
                        ลบภาพนี้
                      </button>
                    </div>
                  </div>

                  {/* 5-Column Review Grid matching the 5x3 / 5x2 layout in RoV */}
                  <div className="scannerReviewGrid">
                    {page.slots.map((slot) => {
                      const isIncluded =
                        slot.included && Boolean(slot.selectedMatch);
                      const match = slot.selectedMatch;
                      const isPickerOpen = manualPickerSlotId === slot.slotId;

                      return (
                        <div
                          key={slot.slotId}
                          className={
                            'scannerSlotCard ' +
                            (isIncluded ? 'matchedCard ' : 'skippedCard ') +
                            (slot.isPartialRow ? 'partialRowCard' : '')
                          }
                        >
                          {/* Top Row of Slot Card */}
                          <div className="scannerSlotHeader">
                            <div className="scannerSlotBadgeGroup">
                              <span className="scannerSlotNum tabular">
                                #{slot.slotNumber}
                              </span>
                              <small className="tabular">
                                แถว {slot.row}·ช่อง {slot.col}
                              </small>
                              {slot.isPartialRow && (
                                <span
                                  className="partialRowPill"
                                  title="แถวที่ 3 ด้านล่างที่โผล่มาบางส่วน ระบบใช้โซนใบหน้าและลำตัวด้านบนในการแมตช์"
                                >
                                  แถว 3
                                </span>
                              )}
                            </div>

                            <label className="scannerSlotIncludeToggle">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() =>
                                  handleToggleSlotIncluded(pageIdx, slot.slotId)
                                }
                              />
                              <span>{isIncluded ? 'นำเข้า' : 'ข้าม'}</span>
                            </label>
                          </div>

                          {/* Side-by-Side Comparison: Left = Screenshot Crop, Right = Matched Web Skin */}
                          <div className="scannerSlotCompareRow">
                            <div className="scannerThumbCol">
                              <div className="scannerThumbFrame">
                                <img
                                  src={slot.cropThumbUrl}
                                  alt={`Card #${slot.slotNumber}`}
                                />
                                <span className="thumbCornerTag">ภาพจากเกม</span>
                              </div>
                            </div>

                            <div className="scannerMatchArrow">→</div>

                            <div className="scannerThumbCol">
                              {isIncluded && match ? (
                                <div className="scannerThumbFrame matchedFrame">
                                  <img
                                    src={match.image}
                                    alt={match.skinName}
                                    referrerPolicy="no-referrer"
                                  />
                                  <span
                                    className={
                                      'scoreCornerTag tabular ' +
                                      (match.score >= 76
                                        ? 'highScore'
                                        : match.score >= 64
                                          ? 'medScore'
                                          : 'lowScore')
                                    }
                                  >
                                    {match.score}%
                                  </span>
                                </div>
                              ) : (
                                <div className="scannerThumbFrame skippedFrame">
                                  <span>ข้ามใบนี้</span>
                                  <small>(ไม่มีในคลังเว็บ)</small>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Matched Skin Name & Hero Name */}
                          <div className="scannerSlotMeta">
                            {isIncluded && match ? (
                              <>
                                <b title={match.skinName}>{match.skinName}</b>
                                <small>{match.heroName}</small>
                              </>
                            ) : (
                              <>
                                <b className="skippedLabelText">
                                  ข้าม (ไม่มีในคลังเว็บ)
                                </b>
                                <small>
                                  {slot.candidates?.[0]
                                    ? `ใกล้เคียงสุด: ${slot.candidates[0].skinName} (${slot.candidates[0].score}%)`
                                    : 'ไม่พบสกินที่ตรงกัน'}
                                </small>
                              </>
                            )}
                          </div>

                          {/* Quick Candidate Switcher + Manual Search Trigger */}
                          <div className="scannerSlotFooter">
                            {slot.candidates && slot.candidates.length > 0 && (
                              <div className="scannerCandidateStrip">
                                {slot.candidates.slice(0, 3).map((cand) => {
                                  const isCurrent =
                                    isIncluded &&
                                    match?.heroId === cand.heroId &&
                                    match?.skinId === cand.skinId;
                                  return (
                                    <button
                                      key={`${cand.heroId}_${cand.skinId}`}
                                      type="button"
                                      className={
                                        'candidateMiniBtn ' +
                                        (isCurrent ? 'active' : '')
                                      }
                                      onClick={() =>
                                        handleSelectCandidateForSlot(
                                          pageIdx,
                                          slot.slotId,
                                          cand
                                        )
                                      }
                                      title={`สลับเป็น ${cand.skinName} (${cand.heroName}) · ความเหมือน ${cand.score}%`}
                                    >
                                      <img
                                        src={cand.image}
                                        alt={cand.skinName}
                                        referrerPolicy="no-referrer"
                                      />
                                      <span className="tabular">
                                        {cand.score}%
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <button
                              type="button"
                              className="scannerManualPickBtn"
                              onClick={() => {
                                setManualPickerSlotId(
                                  isPickerOpen ? null : slot.slotId
                                );
                                setManualSearchQuery('');
                              }}
                            >
                              <Search size={11} />{' '}
                              {isPickerOpen ? 'ปิดค้นหา' : 'เปลี่ยนสกินเอง'}
                            </button>
                          </div>

                          {/* Inline Manual Skin Search Popover */}
                          {isPickerOpen && (
                            <div className="scannerManualPopover">
                              <div className="scannerManualSearchBox">
                                <Search size={13} />
                                <input
                                  autoFocus
                                  placeholder="พิมพ์ชื่อสกิน หรือชื่อฮีโร่..."
                                  value={manualSearchQuery}
                                  onChange={(e) =>
                                    setManualSearchQuery(e.target.value)
                                  }
                                />
                                <button
                                  type="button"
                                  className="scannerSkipOptionBtn"
                                  onClick={() =>
                                    handleSelectCandidateForSlot(
                                      pageIdx,
                                      slot.slotId,
                                      null
                                    )
                                  }
                                >
                                  ข้ามใบนี้
                                </button>
                              </div>

                              <div className="scannerManualResultsList">
                                {filteredManualSkins.map((sk) => (
                                  <button
                                    key={`${sk.heroId}_${sk.skinId}`}
                                    type="button"
                                    className="scannerManualResultItem"
                                    onClick={() =>
                                      handleSelectCandidateForSlot(
                                        pageIdx,
                                        slot.slotId,
                                        { ...sk, score: 100 }
                                      )
                                    }
                                  >
                                    <img
                                      src={sk.image}
                                      alt={sk.skinName}
                                      referrerPolicy="no-referrer"
                                    />
                                    <div>
                                      <b>{sk.skinName}</b>
                                      <small>{sk.heroName}</small>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Modal Footer */}
        <div className="skinScannerModalFooter">
          <div className="scannerFooterSummary tabular">
            <span>
              สแกนทั้งหมด <b>{summaryStats.totalSlots}</b> ช่อง
            </span>
            <span>·</span>
            <span className="textSuccess">
              พร้อมนำเข้า <b>{summaryStats.matchedCount}</b> ใบ
            </span>
            <span>·</span>
            <span className="textMuted">
              ข้าม <b>{summaryStats.skippedCount}</b> ใบ
            </span>
          </div>

          <div className="scannerFooterRightActions">
            <div className="scannerImportModeToggle">
              <button
                type="button"
                className={appendMode === 'append' ? 'active' : ''}
                onClick={() => setAppendMode('append')}
              >
                + เพิ่มต่อท้ายตารางเดิม
              </button>
              <button
                type="button"
                className={appendMode === 'replace' ? 'active' : ''}
                onClick={() => setAppendMode('replace')}
              >
                แทนที่ตารางเดิม
              </button>
            </div>

            <button type="button" className="secondary" onClick={onClose}>
              ยกเลิก
            </button>

            <button
              type="button"
              className="primary scannerConfirmImportBtn"
              disabled={summaryStats.matchedCount === 0}
              onClick={handleConfirmImport}
            >
              <Check size={16} /> นำเข้าสกินที่แมตช์เข้าพรีวิว (
              {summaryStats.matchedCount} รูป)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
