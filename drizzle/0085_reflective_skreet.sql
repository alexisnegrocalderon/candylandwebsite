ALTER TABLE `partyProfiles` ADD `rulesAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `banned` int DEFAULT 0 NOT NULL;