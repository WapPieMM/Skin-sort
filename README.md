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
- คลังข้อมูลฮีโร่และสกินแบบแยกโมดูล (`src/rovCatalog.js`) พร้อม ID, role, lane, rarity และช่อง image สำหรับต่อยอด
- คลังข้อมูลตั้งต้น 8 ฮีโร่ / 24 รายการสกิน (ข้อมูลตัวอย่าง รอการตรวจสอบกับข้อมูลเกมจริง)

## สิ่งที่ยังต้องพัฒนาต่อ
- ตรวจสอบและเติมข้อมูลฮีโร่/สกินให้ครบและตรงกับข้อมูลเกมปัจจุบัน พร้อมเพิ่มภาพที่มีสิทธิ์ใช้งาน
- หากต้องการบันทึกข้อมูลจากหน้าแอดมินหรือใช้งานข้ามอุปกรณ์ ให้เชื่อม API/ฐานข้อมูลถาวร เช่น Supabase
- เชื่อมฐานข้อมูลถาวรและ storage เช่น Supabase หากต้องการบันทึกผลงานข้ามอุปกรณ์
- ระบบจัดการหลังบ้านสำหรับเพิ่ม/แก้ไขข้อมูลและรูปภาพ
- ตรวจสอบสิทธิ์การใช้งานภาพเกมก่อนเผยแพร่

## Build
`npm run build`


## Hero catalog

The selector currently includes 124 hero names supplied for the project. Skin arrays are empty until verified skin names and artwork are provided; the interface displays an empty-state message rather than inventing skin data.
