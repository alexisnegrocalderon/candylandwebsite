CREATE TABLE `partyCostumeVotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`fromProfileId` int NOT NULL,
	`toProfileId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyCostumeVotes_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `party_costume_votes_pair_idx` ON `partyCostumeVotes` (`fromProfileId`,`toProfileId`);--> statement-breakpoint
CREATE INDEX `party_costume_votes_event_idx` ON `partyCostumeVotes` (`eventId`,`toProfileId`);
