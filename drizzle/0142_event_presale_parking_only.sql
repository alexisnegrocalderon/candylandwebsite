-- Interruptor por evento: 1 = por la web solo se venden entradas y estacionamiento (ningún otro extra).
ALTER TABLE `events` ADD COLUMN `presaleParkingOnly` int NOT NULL DEFAULT 0;
