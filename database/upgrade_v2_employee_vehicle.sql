USE oil_system;

ALTER TABLE vehicles
  ADD COLUMN user_id INT NULL AFTER id,
  ADD INDEX idx_vehicle_user (user_id),
  ADD INDEX idx_vehicle_plate (plate_no);

ALTER TABLE vehicles
  ADD CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

UPDATE vehicles SET user_id = 2 WHERE user_id IS NULL;
