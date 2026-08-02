CREATE TABLE `kitchenTickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`orderId` int NOT NULL,
	`opId` varchar(64) NOT NULL,
	`registerId` int,
	`ticketNumber` varchar(12) NOT NULL,
	`status` enum('pendiente','aprobado','entregado') NOT NULL DEFAULT 'pendiente',
	`items` json NOT NULL,
	`note` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	`approvedByOperatorId` int,
	`deliveredAt` timestamp,
	`deliveredByOperatorId` int,
	CONSTRAINT `kitchenTickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `kitchenTickets_event_number_unique` UNIQUE(`eventId`,`ticketNumber`)
);
--> statement-breakpoint
CREATE TABLE `lockerItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`orderId` int NOT NULL,
	`opId` varchar(64) NOT NULL,
	`tagNumber` varchar(16) NOT NULL,
	`status` enum('guardado','retirado') NOT NULL DEFAULT 'guardado',
	`chargedAt` timestamp NOT NULL DEFAULT (now()),
	`retrievedAt` timestamp,
	`retrievedByOperatorId` int,
	CONSTRAINT `lockerItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `lockerItems_event_tag_unique` UNIQUE(`eventId`,`tagNumber`)
);
--> statement-breakpoint
ALTER TABLE `operators` MODIFY COLUMN `role` enum('admin','supervisor','caja','barra','acceso','cocina') NOT NULL;--> statement-breakpoint
ALTER TABLE `ticketTypes` MODIFY COLUMN `category` enum('acceso','extra','consumo','locker','merch') NOT NULL DEFAULT 'acceso';--> statement-breakpoint
ALTER TABLE `shifts` ADD `countedQr` decimal;--> statement-breakpoint
ALTER TABLE `shifts` ADD `expectedQr` decimal;--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `emoji` varchar(8);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `groupName` varchar(50);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `toKitchen` int DEFAULT 0 NOT NULL;