CREATE TABLE `partyPhotos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`eventId` int NOT NULL,
	`data` mediumblob NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyPhotos_id` PRIMARY KEY(`id`),
	CONSTRAINT `partyPhotos_profileId_unique` UNIQUE(`profileId`)
);
--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `swipeEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `party_photos_event_idx` ON `partyPhotos` (`eventId`);