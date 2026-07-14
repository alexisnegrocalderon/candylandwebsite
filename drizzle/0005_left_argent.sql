ALTER TABLE `orders` ADD `missionDeposit` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `missionTopupStatus` enum('none','pending','paid') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `missionTopupAmount` decimal;--> statement-breakpoint
ALTER TABLE `orders` ADD `missionTopupPreferenceId` varchar(255);--> statement-breakpoint
ALTER TABLE `orders` ADD `depositEmailSent` int DEFAULT 0 NOT NULL;