import React, { useState } from 'react';
import {
  X,
  Upload,
  Link2,
  Plus,
  Trash2,
  Sparkles,
  Check,
  Image as ImageIcon,
  RotateCcw,
  Download,
  FileUp,
} from 'lucide-react';
import { PASTEL_PALETTE } from '../data/defaultCatalog';
import { uploadImageFile } from '../utils/cloudStorage';

export default function HeroSkinModal({
  isOpen,
  onClose,
  heroes,
  activeHeroId,
  onSelectHeroId,
  onUpdateHero,
  onAddHero,
  onDeleteHero,
  onAddSkin,
  onUpdateSkin,
  onDeleteSkin,
  onResetCatalog,
  onExportCatalog,
  onImportCatalog,
}) {
  const currentHero = heroes.find((h) => h.id === activeHeroId) || heroes[0];

  const [isCreatingHero, setIsCreatingHero] = useState(false);
  const [newHeroName, setNewHeroName] = useState('');
  const [newHeroTitle, setNewHeroTitle] = useState('');
  const [newHeroImage, setNewHeroImage] = useState('');

  const [newSkinName, setNewSkinName] = useState('');
  const [newSkinImage, setNewSkinImage] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen || !currentHero) return null;

  const flashStatus = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 2500);
  };

  const handleHeroFileUpload = async (e, target = 'current') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await uploadImageFile(file, 'heroes');
      if (target === 'new') {
        setNewHeroImage(imageUrl);
      } else {
        onUpdateHero(currentHero.id, { image: imageUrl });
        flashStatus(`อัปเดตรูปภาพฮีโร่ ${currentHero.name} เรียบร้อยแล้ว`);
      }
    } catch (err) {
      flashStatus(err.message || 'ไม่สามารถอัปโหลดรูปภาพได้');
    }
    e.target.value = '';
  };

  const handleSkinFileUpload = async (e, skinId = null) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await uploadImageFile(file, 'skins');
      if (skinId) {
        onUpdateSkin(currentHero.id, skinId, { image: imageUrl });
        flashStatus('อัปเดตรูปภาพสกินเรียบร้อยแล้ว');
      } else {
        setNewSkinImage(imageUrl);
      }
    } catch (err) {
      flashStatus(err.message || 'ไม่สามารถอัปโหลดรูปภาพสกินได้');
    }
    e.target.value = '';
  };

  const handleBulkSkinUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (files.length > 20) {
      flashStatus('อัปโหลดได้สูงสุดครั้งละ 20 รูป กรุณาเลือกใหม่อีกครั้ง');
      e.target.value = '';
      return;
    }

    let uploaded = 0;
    let failed = 0;
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < files.length) {
        const index = nextIndex++;
        const file = files[index];
        try {
          const image = await uploadImageFile(file, 'skins');
          const name = file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim() || `Skin ${currentHero.skins.length + uploaded + 1}`;
          onAddSkin(currentHero.id, { name, image });
          uploaded += 1;
        } catch (err) {
          failed += 1;
        }
        setStatusMsg(`กำลังอัปโหลด ${uploaded + failed}/${files.length} รูป...`);
      }
    };

    await Promise.all(Array.from({ length: Math.min(20, files.length) }, worker));
    if (failed) {
      flashStatus(`อัปโหลดสำเร็จ ${uploaded} รูป · ไม่สำเร็จ ${failed} รูป`);
    } else {
      flashStatus(`เพิ่มสกินจากรูปภาพ ${uploaded} รูปสำเร็จ`);
    }
    e.target.value = '';
  };

  const handleCreateHeroSubmit = (e) => {
    e.preventDefault();
    if (!newHeroName.trim()) return;
    const created = onAddHero({
      name: newHeroName.trim(),
      title: newHeroTitle.trim() || 'RoV Hero',
      image: newHeroImage.trim(),
      color: PASTEL_PALETTE[heroes.length % PASTEL_PALETTE.length],
    });
    setNewHeroName('');
    setNewHeroTitle('');
    setNewHeroImage('');
    setIsCreatingHero(false);
    if (created?.id) onSelectHeroId(created.id);
    flashStatus(`เพิ่มฮีโร่ ${created.name} สำเร็จ`);
  };

  const handleCreateSkinSubmit = (e) => {
    e.preventDefault();
    onAddSkin(currentHero.id, {
      name: newSkinName.trim() || `Skin ${currentHero.skins.length + 1}`,
      image: newSkinImage.trim(),
    });
    setNewSkinName('');
    setNewSkinImage('');
    flashStatus(`เพิ่มสกินใหม่ให้ ${currentHero.name} สำเร็จ`);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed) && parsed.length > 0) {
          onImportCatalog(parsed);
          flashStatus('นำเข้าฐานข้อมูลฮีโร่และสกินสำเร็จ');
        }
      } catch {
        flashStatus('ไฟล์ JSON ไม่ถูกต้อง');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <span className="eyebrow">HERO & SKIN IMAGE DATABASE</span>
            <h3>
              จัดการข้อมูลรูปภาพฮีโร่ & สกิน <Sparkles size={18} />
            </h3>
          </div>
          <div className="modalHeaderActions">
            {statusMsg && <span className="statusToast">{statusMsg}</span>}
            <button className="iconCloseBtn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modalBody">
          {/* Left column: Hero selector & Add new hero */}
          <aside className="modalSidebar">
            <div className="sidebarTop">
              <b>รายชื่อฮีโร่ ({heroes.length})</b>
              <button
                className="tinyPrimaryBtn"
                onClick={() => setIsCreatingHero(!isCreatingHero)}
              >
                <Plus size={14} /> เพิ่มฮีโร่ใหม่
              </button>
            </div>

            {isCreatingHero && (
              <form className="newHeroBox" onSubmit={handleCreateHeroSubmit}>
                <b>เพิ่มฮีโร่ใหม่</b>
                <input
                  placeholder="ชื่อฮีโร่ (เช่น Florentino)"
                  value={newHeroName}
                  onChange={(e) => setNewHeroName(e.target.value)}
                  required
                />
                <input
                  placeholder="ฉายา (เช่น Gentle Blade)"
                  value={newHeroTitle}
                  onChange={(e) => setNewHeroTitle(e.target.value)}
                />
                <input
                  placeholder="วางลิงก์ URL รูปฮีโร่..."
                  value={newHeroImage}
                  onChange={(e) => setNewHeroImage(e.target.value)}
                />
                <label className="uploadLabelBtn">
                  <Upload size={13} /> อัปโหลดรูปฮีโร่จากเครื่อง
                  <input
                    type="file"
                    accept="image/*"
                     hidden
                    onChange={(e) => handleHeroFileUpload(e, 'new')}
                  />
                </label>
                <div className="newHeroBtns">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setIsCreatingHero(false)}
                  >
                    ยกเลิก
                  </button>
                  <button type="submit" className="primary">
                    <Check size={14} /> บันทึกฮีโร่
                  </button>
                </div>
              </form>
            )}

            <div className="modalHeroList">
              {[...heroes].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map((h, idx) => (
                <button
                  key={h.id}
                  className={
                    'modalHeroItem ' + (h.id === currentHero.id ? 'active' : '')
                  }
                  onClick={() => onSelectHeroId(h.id)}
                >
                  <div
                    className="modalHeroThumb"
                    style={{
                      background:
                        h.color || PASTEL_PALETTE[idx % PASTEL_PALETTE.length],
                    }}
                  >
                    {h.image ? (
                      <img
                        src={h.image}
                        alt={h.name}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{h.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="modalHeroMeta">
                    <b>{h.name}</b>
                    <small>{h.skins.length} สกิน</small>
                  </div>
                </button>
              ))}
            </div>

            <div className="catalogBackupTools">
              <button className="backupBtn" onClick={onExportCatalog}>
                <Download size={13} /> สำรองข้อมูล JSON
              </button>
              <label className="backupBtn">
                <FileUp size={13} /> นำเข้า JSON
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={handleImportFile}
                />
              </label>
              <button className="backupBtn dangerText" onClick={onResetCatalog}>
                <RotateCcw size={13} /> รีเซ็ตค่าเริ่มต้น
              </button>
            </div>
          </aside>

          {/* Right column: Selected Hero image & Skin list editor */}
          <div className="modalContent">
            <div className="heroEditorSection">
              <div className="heroAvatarPreviewBox">
                <div
                  className="heroAvatarLarge"
                  style={{ background: currentHero.color || '#f5d9ea' }}
                >
                  {currentHero.image ? (
                    <img
                      src={currentHero.image}
                      alt={currentHero.name}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{currentHero.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="avatarQuickBtns">
                  <label className="uploadLabelBtn primaryUpload">
                    <Upload size={14} /> อัปโหลดรูป {currentHero.name}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => handleHeroFileUpload(e, 'current')}
                    />
                  </label>
                  {currentHero.image && (
                    <button
                      type="button"
                      className="clearImgBtn"
                      onClick={() =>
                        onUpdateHero(currentHero.id, { image: '' })
                      }
                    >
                      ลบรูปภาพ
                    </button>
                  )}
                </div>
              </div>

              <div className="heroFieldsGrid">
                <div className="fieldGroup">
                  <label>ชื่อฮีโร่ (Hero Name)</label>
                  <input
                    value={currentHero.name}
                    onChange={(e) =>
                      onUpdateHero(currentHero.id, { name: e.target.value })
                    }
                    placeholder="ชื่อฮีโร่..."
                  />
                </div>
                <div className="fieldGroup fullWidth">
                  <label>
                    <Link2 size={13} /> ลิงก์ URL รูปภาพฮีโร่ ({currentHero.name})
                  </label>
                  <input
                    value={currentHero.image || ''}
                    onChange={(e) =>
                      onUpdateHero(currentHero.id, { image: e.target.value })
                    }
                    placeholder="วางลิงก์รูปภาพฮีโร่ (https://...) หรืออัปโหลดไฟล์จากปุ่มด้านซ้าย"
                  />
                </div>
              </div>

              {heroes.length > 1 && (
                <button
                  type="button"
                  className="deleteHeroBtn"
                  onClick={() => onDeleteHero(currentHero.id)}
                  title="ลบฮีโร่นี้"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            {/* Add new skin form for this hero */}
            <form className="addSkinBar" onSubmit={handleCreateSkinSubmit}>
              <div className="addSkinTitle">
                <Plus size={15} /> เพิ่มสกินใหม่ให้ <b>{currentHero.name}</b>
              </div>
              <div className="addSkinInputs">
                <input
                  placeholder="ชื่อสกิน (ไม่บังคับ)"
                  value={newSkinName}
                  onChange={(e) => setNewSkinName(e.target.value)}
                />
                <input
                  placeholder="ลิงก์ URL รูปสกิน (ถ้ามี)..."
                  value={newSkinImage}
                  onChange={(e) => setNewSkinImage(e.target.value)}
                />
                <label className="uploadLabelBtn">
                  <ImageIcon size={14} /> อัปโหลดหลายรูป (สูงสุด 20 รูปพร้อมกัน)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={handleBulkSkinUpload}
                  />
                </label>
                <button type="submit" className="primary">
                  <Plus size={15} /> เพิ่มสกิน
                </button>
              </div>
            </form>

            {/* Existing skins table/grid for this hero */}
            <div className="skinEditorListHeader">
              <b>
                รายการสกินของ {currentHero.name} ({currentHero.skins.length} สกิน)
              </b>
              <small>สามารถเปลี่ยนชื่อและใส่รูปภาพของแต่ละสกินได้ทันที</small>
            </div>

            <div className="skinEditorList">
              {currentHero.skins.map((skin, idx) => {
                return (
                  <div key={skin.id} className="skinEditorRow">
                    <div
                      className="skinEditorThumb"
                      style={{
                        background:
                          PASTEL_PALETTE[(idx + 1) % PASTEL_PALETTE.length],
                      }}
                    >
                      {skin.image ? (
                        <img
                          src={skin.image}
                          alt={skin.name}
                          referrerPolicy="no-referrer"
                        />
                      ) : currentHero.image ? (
                        <img
                          src={currentHero.image}
                          alt={skin.name}
                          referrerPolicy="no-referrer"
                          className="fallbackHeroImg"
                        />
                      ) : (
                        <span>{skin.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="skinEditorInputs">
                      <div className="skinEditorTopRow">
                        <input
                          value={skin.name}
                          onChange={(e) =>
                            onUpdateSkin(currentHero.id, skin.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="ชื่อสกิน"
                        />
                      </div>

                      <div className="skinEditorBottomRow">
                        <input
                          value={skin.image || ''}
                          onChange={(e) =>
                            onUpdateSkin(currentHero.id, skin.id, {
                              image: e.target.value,
                            })
                          }
                          placeholder="ลิงก์ URL รูปภาพสกินนี้ (หรือกดปุ่มอัปโหลดรูปด้านขวา)"
                        />
                        <label className="uploadLabelBtn">
                          <Upload size={13} /> อัปโหลดรูป
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => handleSkinFileUpload(e, skin.id)}
                          />
                        </label>
                        {skin.image && (
                          <button
                            type="button"
                            className="clearImgBtn"
                            onClick={() =>
                              onUpdateSkin(currentHero.id, skin.id, {
                                image: '',
                              })
                            }
                          >
                            ลบรูป
                          </button>
                        )}
                        {currentHero.skins.length > 1 && (
                          <button
                            type="button"
                            className="iconTrashBtn"
                            onClick={() =>
                              onDeleteSkin(currentHero.id, skin.id)
                            }
                            title="ลบสกินนี้"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
