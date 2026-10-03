CREATE TABLE `orderAddons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`amount` decimal NOT NULL,
	`status` enum('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
	`method` enum('mercadopago','manual'),
	`source` enum('admin','customer') NOT NULL DEFAULT 'admin',
	`preferenceId` varchar(255),
	`paymentUrl` text,
	`paymentId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `orderAddons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `orderAddons_order_idx` ON `orderAddons` (`orderId`);