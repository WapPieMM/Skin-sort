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

  const uploadResponse = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: file,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw new Error(detail || 'อัปโหลดรูปภาพไปยังคลาวด์ไม่สำเร็จ');
  }

  return signed.publicUrl;
}
