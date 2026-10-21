ALTER TABLE `customerPushSubscriptions` ADD `hourHist` json;--> statement-breakpoint
ALTER TABLE `pushCampaigns` ADD `titleB` varchar(80), ADD `bodyB` varchar(255), ADD `abPercent` int NOT NULL DEFAULT 0, ADD `abWaitMin` int NOT NULL DEFAULT 180, ADD `abWinner` varchar(1), ADD `abTestAt` timestamp NULL, ADD `smartHour` int NOT NULL DEFAULT 0, ADD `actions` json;--> statement-breakpoint
CREATE TABLE `pushDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`subscriptionId` int NOT NULL,
	`variant` varchar(1) NOT NULL DEFAULT 'A',
	`status` varchar(10) NOT NULL DEFAULT 'queued',
	`sendAt` timestamp NOT NULL,
	`sentAt` timestamp NULL,
	`clickedAt` timestamp NULL,
	`urlOverride` varchar(500),
	CONSTRAINT `pushDeliveries_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `push_deliveries_campaign_idx` ON `pushDeliveries` (`campaignId`,`status`);--> statement-breakpoint
CREATE INDEX `push_deliveries_due_idx` ON `pushDeliveries` (`status`,`sendAt`);--> statement-breakpoint
CREATE INDEX `push_deliveries_sub_idx` ON `pushDeliveries` (`subscriptionId`);--> statement-breakpoint
CREATE TABLE `pushPresets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(12) NOT NULL,
	`name` varchar(80) NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pushPresets_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE `pushAutoLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(24) NOT NULL,
	`subjectKey` varchar(200) NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pushAutoLog_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `push_auto_log_key_idx` ON `pushAutoLog` (`kind`,`subjectKey`);
