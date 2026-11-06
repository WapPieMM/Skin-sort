# RoV Skin Generator — Starter Project

โปรเจกต์เริ่มต้นสำหรับเว็บไซต์ RoV Skin Generator ธีม White Angel

## วิธีเปิดใช้งาน
1. ติดตั้ง Node.js รุ่น LTS จาก https://nodejs.org
2. แตกไฟล์ ZIP
3. เปิด Terminal/Command Prompt ในโฟลเดอร์โปรเจกต์
4. รันคำสั่ง:
   ```bash
   npm install
   npm run dev
   ```
5. เปิด URL ที่ Vite แสดง (ปกติคือ http://localhost:5173)

## มีอะไรใน starter นี้
- UI แบบ 5 ขั้นตอน: เลือกฮีโร่, เลือกสกิน, จัดเรียง, เลือกโหมดภาพ, พรีวิว/ดาวน์โหลด
- Responsive สำหรับมือถือและ iPad
- ปุ่มจัดเรียงสกินและเลือกพื้นหลัง
- ดาวน์โหลดพรีวิวเป็น PNG
- ตัวอย่างข้อมูลฮีโร่/สกินแบบ placeholder

## สิ่งที่ยังต้องพัฒนาต่อ
- เพิ่มคลังภาพและข้อมูลฮีโร่/สกิน RoV จริง (ตัวอย่างตอนนี้ใช้ตัวอักษร/สีแทนภาพ)
- เชื่อมฐานข้อมูลถาวรและ storage เช่น Supabase หากต้องการบันทึกผลงานข้ามอุปกรณ์
- ระบบจัดการหลังบ้านสำหรับเพิ่ม/แก้ไขข้อมูลและรูปภาพ
- ตรวจสอบสิทธิ์การใช้งานภาพเกมก่อนเผยแพร่

## Build
`npm run build`


## Vercel Admin Access

เว็บจะเปิดให้ใช้งานหลังจากแอดมินเข้าสู่ระบบด้วยรหัสผ่านที่ตั้งใน Vercel Environment Variables

ตั้งค่าตัวแปรต่อไปนี้ใน Vercel → Project → Settings → Environment Variables แล้ว Redeploy:

- `ADMIN_PASSWORD`: รหัสผ่านแอดมินที่คาดเดายาก
- `ADMIN_SESSION_SECRET`: ค่าสุ่มลับอย่างน้อย 32 ไบต์ ใช้ลงลายเซ็น session cookie

ห้ามใส่ค่าจริงลงใน Git หรือไฟล์ฝั่งหน้าเว็บ ระบบใช้ HttpOnly, Secure (บน HTTPS), SameSite=Strict cookie และ session หมดอายุใน 12 ชั่วโมง

ตัวอย่างสร้าง session secret ด้วย Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

หากยังไม่ได้ตั้ง Environment Variables ระบบ API จะปฏิเสธการเข้าสู่ระบบตามค่าเริ่มต้น


## Supabase Image Storage

Image uploads use signed upload URLs created by the Vercel server after validating the admin session. Original image files are uploaded directly from the browser to Supabase Storage; the application does not resize or recompress those originals.

Before enabling cloud uploads:

1. In Supabase Dashboard, open **SQL Editor** and run the contents of `supabase/setup.sql` once. This creates the public-read `skin-images` bucket with a 20 MB file limit.
2. In Vercel → Project → Settings → Environment Variables, add:
   - `SUPABASE_URL`: your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key
   - `SUPABASE_STORAGE_BUCKET`: `skin-images` (optional; this is the default)
3. Redeploy the Vercel project.

Never add the service-role key to a `VITE_*` variable, frontend code, or Git. The bucket is public only for image delivery; this project does not create anonymous upload or delete policies. New uploads are stored in cloud storage, while the existing IndexedDB catalog remains local until the separate catalog-sync and legacy-image migration step is completed.
