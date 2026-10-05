CREATE TABLE `cajaAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`kind` varchar(40) NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'warning',
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`dedupeKey` varchar(191) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cajaAlerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `cajaAlerts_dedupe_unique` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `kitchenTickets` MODIFY COLUMN `status` enum('pendiente','aprobado','entregado','anulado') NOT NULL DEFAULT 'pendiente';--> statement-breakpoint
ALTER TABLE `lockerItems` MODIFY COLUMN `status` enum('pendiente','guardado','retirado','anulado') NOT NULL DEFAULT 'pendiente';--> statement-breakpoint
ALTER TABLE `ops` MODIFY COLUMN `type` enum('redeem','checkin','sale','void_code','note','shift_open','shift_close','manual_adjust','locker_return','kitchen_update','parking_paid','void_sale') NOT NULL;--> statement-breakpoint
CREATE INDEX `cajaAlerts_event_created_idx` ON `cajaAlerts` (`eventId`,`createdAt`);