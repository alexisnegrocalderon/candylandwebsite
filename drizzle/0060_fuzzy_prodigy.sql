CREATE TABLE `igKeywordAutomations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(120) NOT NULL,
	`triggerSource` enum('comment','story_reply','both') NOT NULL DEFAULT 'both',
	`replyMessage` text NOT NULL,
	`discountCode` varchar(40),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `igKeywordAutomations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `igKeywordRedemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`automationId` int NOT NULL,
	`igUserId` varchar(64) NOT NULL,
	`source` enum('comment','story_reply') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `igKeywordRedemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `ig_keyword_redemptions_unique_idx` UNIQUE(`automationId`,`igUserId`)
);
--> statement-breakpoint
CREATE INDEX `ig_keyword_automations_keyword_idx` ON `igKeywordAutomations` (`keyword`);