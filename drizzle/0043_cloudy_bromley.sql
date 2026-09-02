CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(20),
	`instagram` varchar(100),
	`eventId` int,
	`source` varchar(50) NOT NULL DEFAULT 'price_alert',
	`utmSource` varchar(100),
	`utmMedium` varchar(100),
	`utmCampaign` varchar(100),
	`convertedOrderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_email_event_idx` UNIQUE(`email`,`eventId`)
);
--> statement-breakpoint
CREATE TABLE `stockPools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`totalCap` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stockPools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `utmSource` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `utmMedium` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `utmCampaign` varchar(100);--> statement-breakpoint
ALTER TABLE `orders` ADD `utmContent` varchar(100);--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `stockPoolId` int;--> statement-breakpoint
CREATE INDEX `stockPools_event_idx` ON `stockPools` (`eventId`);