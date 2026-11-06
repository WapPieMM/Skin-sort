import { compressImageFile } from './imageHelper';

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function uploadImageFile(file, folder = 'skins') {
  if (!(file instanceof File)) {
    throw new Error('ไม่พบไฟล์รูปภาพ');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('รูปภาพต้องมีขนาดไม่เกิน 20 MB');
  }

  try {
    const signResponse = await fetch('/api/admin/storage-sign', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentType: file.type,
        size: file.size,
        folder,
      }),
    });
    const signed = await signResponse.json().catch(() => ({}));
    if (!signResponse.ok) {
      throw new Error(signed.error || 'ไม่สามารถเตรียมการอัปโหลดได้');
    }

    const uploadBody = new FormData();
    uploadBody.append('cacheControl', '31536000');
    uploadBody.append('', file);

    const uploadResponse = await fetch(signed.signedUrl, {
      method: 'PUT',
      body: uploadBody,
    });
    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text().catch(() => '');
      throw new Error(detail || 'อัปโหลดรูปภาพไปยังคลาวด์ไม่สำเร็จ');
    }

    return signed.publicUrl;
  } catch {
    // Fallback to local high-quality Data URL when using temp login or offline
    return await compressImageFile(file, 720, 0.92);
  }
}

