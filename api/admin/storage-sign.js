import crypto from 'node:crypto';
import { isAdminSessionValid } from '../../lib/adminAuth.js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'skin-images';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MIME_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบแอดมินก่อนอัปโหลดรูป' });
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า Supabase Storage บนเซิร์ฟเวอร์' });
  }

  const { contentType, size, folder } = req.body || {};
  const extension = MIME_EXTENSIONS[contentType];
  if (!extension) {
    return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ JPG, PNG, WebP, GIF และ AVIF' });
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'ขนาดไฟล์ต้องไม่เกิน 20 MB' });
  }
  if (!['heroes', 'skins', 'branding'].includes(folder)) {
    return res.status(400).json({ error: 'Invalid upload folder' });
  }

  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const signEndpoint = `${supabaseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(BUCKET)}/${encodedPath}`;

  try {
    const response = await fetch(signEndpoint, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) {
      console.error('Supabase signed upload URL request failed:', response.status, result.message || result.error);
      return res.status(502).json({ error: 'ไม่สามารถเตรียมพื้นที่อัปโหลดรูปภาพได้' });
    }

    const signedUrl = `${supabaseUrl}/storage/v1${result.url}`;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodedPath}`;
    return res.status(200).json({ signedUrl, publicUrl, path });
  } catch (error) {
    console.error('Supabase signed upload URL request error:', error);
    return res.status(502).json({ error: 'เชื่อมต่อ Supabase Storage ไม่สำเร็จ' });
  }
}
