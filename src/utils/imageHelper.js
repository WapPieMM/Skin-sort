/**
 * Reads an uploaded image file and resizes/compresses it via HTML5 Canvas
 * so it can be stored cleanly in localStorage and exported via html-to-image without CORS issues.
 */
export function compressImageFile(file, maxWidth = 990, quality = 0.94) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('ไม่ได้เลือกไฟล์รูปภาพ'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Preserve transparency if PNG and small, otherwise use high-quality WebP/JPEG
          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const dataUrl = canvas.toDataURL(outputType, quality);
          resolve(dataUrl);
        } catch (err) {
          resolve(event.target.result);
        }
      };
      img.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้'));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการอ่านไฟล์'));
    reader.readAsDataURL(file);
  });
}
