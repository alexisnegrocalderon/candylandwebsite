CREATE TABLE `emailLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`to` varchar(320) NOT NULL,
	`subject` varchar(255),
	`success` int NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emailLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `mailingRecipients` MODIFY COLUMN `status` enum('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `mailingCampaigns` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `mailingCampaigns` ADD `skippedCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `email_log_sent_at_idx` ON `emailLog` (`sentAt`);