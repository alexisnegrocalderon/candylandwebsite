ALTER TABLE `partyConnections` ADD `lowReadAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `partyConnections` ADD `highReadAt` timestamp NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `rewindsUsed` int DEFAULT 0 NOT NULL;
