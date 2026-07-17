CREATE TABLE `operators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`pinHash` varchar(255) NOT NULL,
	`role` enum('admin','supervisor','caja','barra','acceso') NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `operators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ops` (
	`id` varchar(36) NOT NULL,
	`type` enum('redeem','sale','void_code','note','shift_open','shift_close','manual_adjust') NOT NULL,
	`eventId` int NOT NULL,
	`operatorId` int NOT NULL,
	`registerId` int,
	`targetType` varchar(32) NOT NULL,
	`targetId` varchar(64) NOT NULL,
	`payload` json,
	`clientAt` timestamp NOT NULL,
	`serverAt` timestamp NOT NULL DEFAULT (now()),
	`result` enum('applied','conflict','rejected') NOT NULL,
	`conflictNote` varchar(500),
	CONSTRAINT `ops_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `channel` enum('web','caja','import') DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `operatorId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `registerId` int;--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `costPrice` decimal;--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `color` varchar(20);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `internalCode` varchar(10);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `barcode` varchar(64);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `metadata` json;--> statement-breakpoint
ALTER TABLE `tickets` ADD `usedByOperatorId` int;--> statement-breakpoint
ALTER TABLE `tickets` ADD `usedAtRegisterId` int;--> statement-breakpoint
ALTER TABLE `tickets` ADD `displayCode` varchar(20);--> statement-breakpoint
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_displayCode_unique` UNIQUE(`displayCode`);