CREATE TABLE `orderUpgrades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`fromTicketTypeId` int NOT NULL,
	`toTicketTypeId` int NOT NULL,
	`amount` decimal NOT NULL,
	`status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
	`method` enum('mercadopago','manual'),
	`preferenceId` varchar(255),
	`paymentUrl` text,
	`paymentId` varchar(255),
	`thirdName` varchar(255),
	`thirdRut` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `orderUpgrades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `orderUpgrades_order_idx` ON `orderUpgrades` (`orderId`);