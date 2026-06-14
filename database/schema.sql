CREATE DATABASE IF NOT EXISTS oil_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE oil_system;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS deliveries;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','employee') NOT NULL DEFAULT 'employee',
  phone VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  plate_no VARCHAR(60) NOT NULL,
  vehicle_no VARCHAR(60) NULL,
  driver_name VARCHAR(120) NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_vehicle_user (user_id),
  INDEX idx_vehicle_plate (plate_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  vehicle_id INT NULL,
  work_date DATE NOT NULL,
  report_month VARCHAR(30) NULL,
  bill_no VARCHAR(80) NULL,
  origin_place VARCHAR(255) NULL,
  load_date DATE NULL,
  oil_type VARCHAR(120) NULL,
  unload_date DATE NULL,
  destination_place VARCHAR(255) NULL,
  tank_weight DECIMAL(12,3) NOT NULL DEFAULT 0,
  quantity_liters DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_baht DECIMAL(12,2) NOT NULL DEFAULT 0,
  distance_km DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_used_liters DECIMAL(12,2) NOT NULL DEFAULT 0,
  wage_payer VARCHAR(120) NULL,
  payment_status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  receipt_photo VARCHAR(255) NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_deliveries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_deliveries_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  INDEX idx_work_date (work_date),
  INDEX idx_user_date (user_id, work_date),
  INDEX idx_oil_type (oil_type),
  INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  delivery_id INT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info','warning','danger','success') NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_notify_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
  INDEX idx_read (is_read),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (name, username, password_hash, role, phone) VALUES
('เจ้าของกิจการ', 'owner', '$2y$12$2.c/iIxpLNdzyqVuVgYR.OI60/LodiOGTlXXZr6rgCg/LfHXa1duC', 'owner', '0800000000'),
('พนักงานขับรถ', 'employee', '$2y$12$2.c/iIxpLNdzyqVuVgYR.OI60/LodiOGTlXXZr6rgCg/LfHXa1duC', 'employee', '0811111111');

INSERT INTO vehicles (user_id, plate_no, vehicle_no, driver_name, description) VALUES
(2, '70-2791', 'รถบรรทุก 1', 'พนักงานขับรถ', 'รถน้ำมันหลัก'),
(2, '70-2922', 'รถบรรทุก 2', 'พนักงานขับรถ', 'รถน้ำมันสำรอง');

INSERT INTO deliveries
(user_id, vehicle_id, work_date, report_month, bill_no, origin_place, load_date, oil_type, unload_date, destination_place, tank_weight, quantity_liters, amount_baht, distance_km, fuel_used_liters, wage_payer, payment_status, note)
VALUES
(2, 1, CURDATE(), DATE_FORMAT(CURDATE(), '%Y-%m'), 'B001', 'กรุงเทพฯ', CURDATE(), 'ดีเซล', CURDATE(), 'เชียงใหม่', 30.290, 169.54, 7000, 680, 82, 'บริษัทคู่ค้า', 'paid', 'ตัวอย่างข้อมูลจากกระดาษ'),
(2, 2, DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_FORMAT(CURDATE(), '%Y-%m'), 'B002', 'กระบี่', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'เบนซิน', CURDATE(), 'ลำพูน', 30.450, 232.10, 9950, 740, 91, 'บริษัทคู่ค้า', 'pending', 'ยังไม่แนบรูป'),
(2, 1, DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_FORMAT(CURDATE(), '%Y-%m'), 'B003', 'แพร่', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'ดีเซล', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'ลำปาง', 30.800, 293.32, 11587, 310, 40, 'เงินสด', 'paid', 'ตัวอย่าง');

INSERT INTO notifications (user_id, delivery_id, title, message, type) VALUES
(NULL, 2, 'ยังไม่จ่ายค่าแรง', 'รายการ B002 ยังอยู่สถานะรอจ่าย', 'warning'),
(NULL, 2, 'ยังไม่แนบรูปบิล', 'รายการ B002 ไม่มีรูปบิลหรือรูปเอกสารแนบ', 'info');
