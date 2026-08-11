-- Separar operadores, dispositivos y cajas por evento (pedido explícito del
-- usuario): hasta ahora eran globales y se iban acumulando entre fiestas sin
-- poder borrarse. Se agregan nullable primero para poder backfillear las
-- filas ya existentes -- todas pertenecen al primer evento de la plataforma,
-- Candyland -- antes de aplicar el NOT NULL final (mismo patrón de
-- add-nullable/backfill/set-not-null que 0032_plain_husk usó para
-- events.missionForceClosed, pero en tres pasos separados porque acá el
-- valor de backfill no es una constante sino el id real de Candyland).
ALTER TABLE `devices` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `operators` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `registers` ADD `eventId` int;--> statement-breakpoint
UPDATE `devices` SET `eventId` = (SELECT `id` FROM `events` WHERE `slug` = 'candyland-agosto-2026') WHERE `eventId` IS NULL;--> statement-breakpoint
UPDATE `operators` SET `eventId` = (SELECT `id` FROM `events` WHERE `slug` = 'candyland-agosto-2026') WHERE `eventId` IS NULL;--> statement-breakpoint
UPDATE `registers` SET `eventId` = (SELECT `id` FROM `events` WHERE `slug` = 'candyland-agosto-2026') WHERE `eventId` IS NULL;--> statement-breakpoint
ALTER TABLE `devices` MODIFY COLUMN `eventId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `operators` MODIFY COLUMN `eventId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `registers` MODIFY COLUMN `eventId` int NOT NULL;--> statement-breakpoint
CREATE INDEX `devices_event_idx` ON `devices` (`eventId`);--> statement-breakpoint
CREATE INDEX `operators_event_idx` ON `operators` (`eventId`);--> statement-breakpoint
CREATE INDEX `registers_event_idx` ON `registers` (`eventId`);
