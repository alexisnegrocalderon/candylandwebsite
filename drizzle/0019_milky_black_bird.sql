CREATE TABLE `mailingCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`audienceDescription` text,
	`content` json NOT NULL,
	`ctaUrl` varchar(500) NOT NULL,
	`eventSections` json,
	`status` enum('sending','done') NOT NULL DEFAULT 'sending',
	`totalRecipients` int NOT NULL,
	`sentCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mailingCampaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mailingRecipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`customerId` int NOT NULL,
	`status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`reason` varchar(500),
	`sentAt` timestamp,
	CONSTRAINT `mailingRecipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mailing_recipients_campaign_status_idx` ON `mailingRecipients` (`campaignId`,`status`);