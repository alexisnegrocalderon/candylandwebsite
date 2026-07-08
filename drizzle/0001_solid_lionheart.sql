CREATE TABLE `discountCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` varchar(255),
	`discountType` enum('percentage','fixed') NOT NULL,
	`discountValue` decimal NOT NULL,
	`minPurchase` decimal,
	`maxUses` int,
	`usedCount` int NOT NULL DEFAULT 0,
	`eventId` int,
	`validFrom` timestamp,
	`validUntil` timestamp,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discountCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discountCodes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`shortDescription` varchar(500),
	`imageUrl` text,
	`galleryUrls` text,
	`venue` varchar(255),
	`address` varchar(500),
	`eventDate` timestamp NOT NULL,
	`doorsOpen` timestamp,
	`eventEnd` timestamp,
	`status` enum('draft','published','soldout','cancelled','past') NOT NULL DEFAULT 'draft',
	`featured` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `orderItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`quantity` int NOT NULL,
	`unitPrice` decimal NOT NULL,
	`totalPrice` decimal NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orderItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(32) NOT NULL,
	`userId` int,
	`buyerName` varchar(255) NOT NULL,
	`buyerEmail` varchar(320) NOT NULL,
	`buyerPhone` varchar(20),
	`eventId` int NOT NULL,
	`subtotal` decimal NOT NULL,
	`discount` decimal NOT NULL DEFAULT '0',
	`total` decimal NOT NULL,
	`discountCodeId` int,
	`ambassadorCode` varchar(32),
	`paymentStatus` enum('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
	`paymentId` varchar(255),
	`paymentMethod` varchar(64),
	`mercadoPagoPreferenceId` varchar(255),
	`emailSent` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambassadorUserId` int NOT NULL,
	`ambassadorCode` varchar(32) NOT NULL,
	`orderId` int NOT NULL,
	`buyerEmail` varchar(320) NOT NULL,
	`ticketCount` int NOT NULL,
	`orderTotal` decimal NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticketTypes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(500),
	`price` decimal NOT NULL,
	`originalPrice` decimal,
	`totalStock` int NOT NULL,
	`soldCount` int NOT NULL DEFAULT 0,
	`maxPerOrder` int NOT NULL DEFAULT 10,
	`sortOrder` int NOT NULL DEFAULT 0,
	`status` enum('active','soldout','hidden') NOT NULL DEFAULT 'active',
	`salesStart` timestamp,
	`salesEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ticketTypes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketCode` varchar(64) NOT NULL,
	`orderId` int NOT NULL,
	`orderItemId` int NOT NULL,
	`eventId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`holderName` varchar(255),
	`qrData` text,
	`qrImageUrl` text,
	`status` enum('valid','used','cancelled') NOT NULL DEFAULT 'valid',
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `tickets_ticketCode_unique` UNIQUE(`ticketCode`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `ambassadorCode` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `referredBy` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `totalReferrals` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_ambassadorCode_unique` UNIQUE(`ambassadorCode`);