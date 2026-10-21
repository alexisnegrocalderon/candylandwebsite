CREATE TABLE `customerPushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`email` varchar(320),
	`emailNorm` varchar(320),
	`orderId` int,
	`source` varchar(20) NOT NULL,
	`platform` varchar(10) NOT NULL,
	`standalone` int NOT NULL DEFAULT 0,
	`optedOutAt` timestamp NULL,
	`lastMarketingAt` timestamp NULL,
	`lastSentAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerPushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerPushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);--> statement-breakpoint
CREATE INDEX `customer_push_email_idx` ON `customerPushSubscriptions` (`emailNorm`);--> statement-breakpoint
CREATE TABLE `pushCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(80) NOT NULL,
	`body` varchar(255) NOT NULL,
	`url` varchar(500) NOT NULL,
	`imageUrl` varchar(500),
	`segment` json NOT NULL,
	`kind` varchar(20) NOT NULL DEFAULT 'manual',
	`status` varchar(20) NOT NULL DEFAULT 'draft',
	`eventId` int,
	`scheduledAt` timestamp NULL,
	`sentAt` timestamp NULL,
	`targeted` int NOT NULL DEFAULT 0,
	`sent` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`clicks` int NOT NULL DEFAULT 0,
	`createdBy` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pushCampaigns_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `push_campaigns_status_idx` ON `pushCampaigns` (`status`,`scheduledAt`);--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `customerPushConfig` json;
