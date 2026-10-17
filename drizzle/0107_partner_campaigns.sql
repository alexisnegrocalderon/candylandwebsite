CREATE TABLE `partnerCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(50) NOT NULL,
	`eventId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`emoji` varchar(16) NOT NULL DEFAULT '🎧',
	`headline` varchar(255),
	`pricePerPerson` int NOT NULL,
	`allowedAccesoSlugs` json,
	`maxPersons` int,
	`isActive` int NOT NULL DEFAULT 1,
	`rulesText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partnerCampaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `partnerCampaigns_slug_unique` UNIQUE(`slug`)
);--> statement-breakpoint
CREATE TABLE `partnerOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`campaignId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partnerOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `partnerOrders_orderId_unique` UNIQUE(`orderId`)
);--> statement-breakpoint
CREATE INDEX `partner_orders_campaign_idx` ON `partnerOrders` (`campaignId`);--> statement-breakpoint
INSERT INTO `partnerCampaigns` (`slug`, `eventId`, `label`, `emoji`, `pricePerPerson`, `isActive`)
SELECT 'electronica', `id`, 'Comunidad Electrónica', '🎧', 5000, 1 FROM `events` WHERE `slug` = '2do-aniversario-playroom' LIMIT 1;
