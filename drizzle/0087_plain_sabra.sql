CREATE TABLE `partySwipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`fromProfileId` int NOT NULL,
	`toProfileId` int NOT NULL,
	`liked` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partySwipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `party_swipes_pair_idx` UNIQUE(`fromProfileId`,`toProfileId`)
);
--> statement-breakpoint
ALTER TABLE `partyConnections` ADD `viaSwipe` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `party_swipes_event_idx` ON `partySwipes` (`eventId`);