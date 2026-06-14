# OilOps Mobile Realtime System

ระบบแปลงเอกสารบันทึกน้ำมันจากกระดาษเป็นเว็บ ใช้ **Frontend React + Tailwind CSS**, **Backend PHP API**, **MySQL**, **JWT Login**, รองรับมือถือ, Upload รูป, Export PDF, Dashboard realtime และระบบสิทธิ์เจ้าของ/พนักงาน

## สิ่งที่แก้ในเวอร์ชันนี้

- เอา Dashboard ของพนักงานออกแล้ว
- พนักงานเข้าเว็บแล้วเจอหน้า **บันทึกงานแบบมือถือ** ทันที
- พนักงานกรอกทะเบียนรถเองได้ ไม่ต้องให้เจ้าของเพิ่มให้ก่อน
- ถ้าพนักงานกรอกทะเบียนใหม่ ระบบจะสร้างทะเบียนรถให้เอง
- เจ้าของกิจการดูข้อมูลจากพนักงานทุกคนแบบ realtime บน Dashboard
- หน้าเจ้าของดูทะเบียนรถทั้งหมด พร้อมชื่อพนักงานและจำนวนเที่ยวงาน
- UX/UI ปรับใหม่ให้ใช้บนมือถือได้ง่าย กดน้อยลง
- เพิ่ม bottom navigation บนมือถือ
- Upload รูปจากกล้องมือถือได้
- Export PDF รายงานได้
- แก้ปัญหา Apache 404 ด้วยการเรียก API ผ่าน `index.php?route=...`
- แก้การอ่าน JWT Authorization Header บน XAMPP

---

## โครงสร้างโฟลเดอร์ที่ถูกต้อง

ให้แตก zip แล้ว copy โฟลเดอร์ `oil-management-system` ไปไว้ที่:

```txt
C:\xampp\htdocs\oil-management-system
```

ต้องได้โครงสร้างแบบนี้:

```txt
C:\xampp\htdocs\oil-management-system
├─ backend
│  ├─ config.php
│  └─ public
│     ├─ index.php
│     ├─ .htaccess
│     └─ uploads
├─ database
│  ├─ schema.sql
│  └─ upgrade_v2_employee_vehicle.sql
└─ frontend
```

> ถ้าวางเป็น `oil-management-system-fixed\oil-management-system` ต้องย้ายโฟลเดอร์ข้างในออกมาให้เหลือ `htdocs\oil-management-system` ไม่งั้น Vite proxy จะเรียก backend ผิด path

---

## 1) เปิด XAMPP

เปิด XAMPP แล้ว Start:

```txt
Apache
MySQL
```

---

## 2) Import Database

เปิด phpMyAdmin:

```txt
http://localhost/phpmyadmin
```

แล้ว import ไฟล์:

```txt
C:\xampp\htdocs\oil-management-system\database\schema.sql
```

ถ้าเคย import เวอร์ชันเก่าไว้แล้ว แนะนำให้ import `schema.sql` ใหม่ เพราะเวอร์ชันนี้เพิ่มคอลัมน์ `vehicles.user_id`

ถ้าไม่อยากลบข้อมูลเดิม ให้ลองรัน:

```txt
database/upgrade_v2_employee_vehicle.sql
```

---

## 3) ทดสอบ Backend

เปิด browser:

```txt
http://localhost/oil-management-system/backend/public/index.php?route=/
```

ถ้าถูกต้องจะได้ JSON ประมาณนี้:

```json
{"success":true,"name":"OilOps PHP API"}
```

---

## 4) รัน Frontend

เปิด Terminal:

```powershell
cd C:\xampp\htdocs\oil-management-system\frontend
npm install
npm run dev
```

เปิดเว็บ:

```txt
http://localhost:5173
```

---

## 5) บัญชีทดสอบ

```txt
เจ้าของกิจการ
username: owner
password: password123
```

```txt
พนักงาน
username: employee
password: password123
```

---

## วิธีใช้บนมือถือในวง Wi-Fi เดียวกัน

1. ให้คอมและมือถืออยู่ Wi-Fi เดียวกัน
2. หา IP เครื่องคอม เช่น `192.168.1.35`
3. ตอนรัน frontend ต้องเป็น `npm run dev` ซึ่งตั้งค่า `--host 0.0.0.0` ไว้แล้ว
4. เปิดในมือถือ:

```txt
http://192.168.1.35:5173
```

ระบบใช้ `/api` ผ่าน Vite proxy ดังนั้นมือถือจะไม่ต้องยิง PHP ด้วย `localhost` เอง

ถ้ามือถือเข้าไม่ได้ ให้เช็ก Windows Firewall อนุญาต Node.js หรือ Vite แล้วลองใหม่

---

## กรณีเจอ 404 Not Found

ถ้าเปิด:

```txt
http://localhost/oil-management-system/backend/public/index.php
```

แล้วขึ้น endpoint ไม่พบ ให้เปิดแบบนี้แทน:

```txt
http://localhost/oil-management-system/backend/public/index.php?route=/
```

ถ้ายังเป็น Apache 404 HTML แปลว่า path โฟลเดอร์ไม่ถูก ต้องเช็กว่าไฟล์นี้มีจริง:

```txt
C:\xampp\htdocs\oil-management-system\backend\public\index.php
```

---

## กรณีขึ้น “กรุณาเข้าสู่ระบบใหม่”

ให้ล้าง token เก่าใน browser:

```js
localStorage.removeItem('oilops_token')
```

แล้ว Refresh และ Login ใหม่

---

## การแก้ path ถ้าจำเป็น

ไฟล์ frontend ใช้ `/api` และ Vite proxy ไปที่ backend:

```txt
frontend/vite.config.js
```

ค่าเริ่มต้นคือ:

```js
target: 'http://localhost/oil-management-system/backend/public/index.php'
```

ถ้าคุณวางโฟลเดอร์ชื่ออื่น ต้องแก้ target ให้ตรงกับ path จริง

---

## ฟีเจอร์หลัก

### เจ้าของกิจการ

- Dashboard realtime refresh ทุก 3 วินาที
- ดูเที่ยวงานทั้งหมด ลิตร เงิน ราคาเฉลี่ย ระยะทาง แจ้งเตือน
- ดูกราฟรายวัน ประเภทน้ำมัน ปลายทางยอดนิยม
- ดูรายการล่าสุดจากพนักงาน
- Export Dashboard PDF
- ดูรายการน้ำมันทั้งหมด
- Upload/ดูรูปบิล
- จัดการพนักงาน
- ดูทะเบียนรถที่พนักงานกรอกเอง

### พนักงาน

- ไม่มีหน้า Dashboard แล้ว
- เข้าเว็บแล้วเจอหน้าเพิ่มงานทันที
- กรอกทะเบียนรถเองได้
- กดเลือกประเภทน้ำมันแบบ chip
- กรอกต้นทาง/ปลายทาง/ลิตร/เงิน
- ถ่ายรูปบิลจากมือถือได้
- บันทึกแล้วเจ้าของเห็นทันที
- ดูรายการล่าสุดของตัวเอง

---

## Tech Stack

```txt
Frontend: React + Vite + Tailwind CSS
Backend: PHP API
Database: MySQL / XAMPP
Auth: JWT Login
PDF: jsPDF + jspdf-autotable
Chart: Recharts
Upload: PHP multipart image upload
Realtime: Polling every 3-5 seconds
```
