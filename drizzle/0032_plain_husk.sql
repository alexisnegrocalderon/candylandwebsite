CREATE TABLE `ticketStockHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketTypeId` int NOT NULL,
	`eventId` int NOT NULL,
	`previousStock` int NOT NULL,
	`newStock` int NOT NULL,
	`changedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticketStockHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `missionForceClosed` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `ticketStockHistory_ticketTypeId_idx` ON `ticketStockHistory` (`ticketTypeId`);--> statement-breakpoint
-- Misión 300 ya cumplió su ciclo para el evento vigente: pasa a valor
-- general de inmediato en vez de esperar el corte automático de 3 días.
UPDATE `events` SET `missionForceClosed` = 1 WHERE `slug` = 'candyland-agosto-2026';