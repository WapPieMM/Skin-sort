import { isAdminSessionValid } from '../../lib/adminAuth.js';

const TABLE_URL = () => {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  return base ? `${base}/rest/v1/skin_catalog` : null;
};

function getHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const tableUrl = TABLE_URL();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!tableUrl || !serviceKey) {
    return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า Supabase Database บนเซิร์ฟเวอร์' });
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch(`${tableUrl}?id=eq.1&select=catalog`, {
        headers: getHeaders(serviceKey),
      });
      if (!response.ok) {
        console.error('Supabase catalog read failed:', response.status, await response.text());
        return res.status(502).json({ error: 'โหลดคลังกลางไม่สำเร็จ' });
      }
      const rows = await response.json();
      return res.status(200).json({ catalog: rows[0]?.catalog || null });
    } catch (error) {
      console.error('Supabase catalog read error:', error);
      return res.status(502).json({ error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
    }
  }

  if (!['POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminSessionValid(req)) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบแอดมินก่อนบันทึกคลัง' });
  }

  const catalog = req.body?.catalog;
  if (!Array.isArray(catalog) || catalog.length > 1000) {
    return res.status(400).json({ error: 'รูปแบบข้อมูลคลังไม่ถูกต้อง' });
  }
  if (Buffer.byteLength(JSON.stringify(catalog), 'utf8') > 4 * 1024 * 1024) {
    return res.status(413).json({ error: 'ข้อมูลคลังมีขนาดใหญ่เกินไป' });
  }

  try {
    const insertOnly = req.method === 'POST';
    const response = await fetch(tableUrl, {
      method: insertOnly ? 'POST' : 'POST',
      headers: getHeaders(serviceKey, {
        Prefer: insertOnly
          ? 'return=minimal'
          : 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify({
        id: 1,
        catalog,
        updated_at: new Date().toISOString(),
      }),
    });
    if (insertOnly && response.status === 409) {
      return res.status(409).json({ error: 'คลังกลางถูกตั้งค่าไว้แล้ว' });
    }
    if (!response.ok) {
      const detail = await response.text();
      console.error('Supabase catalog write failed:', response.status, detail);
      return res.status(502).json({ error: 'บันทึกคลังกลางไม่สำเร็จ' });
    }
    return res.status(200).json({ saved: true });
  } catch (error) {
    console.error('Supabase catalog write error:', error);
    return res.status(502).json({ error: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' });
  }
}
