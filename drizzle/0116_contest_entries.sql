CREATE TABLE `contestEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contestId` int NOT NULL,
	`participantId` int NOT NULL,
	`kind` enum('story','dm') NOT NULL,
	`imageUrl` text NOT NULL,
	`mid` varchar(100) NOT NULL,
	`hidden` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contestEntries_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `contest_entries_mid_idx` ON `contestEntries` (`contestId`,`mid`);--> statement-breakpoint
CREATE INDEX `contest_entries_person_idx` ON `contestEntries` (`contestId`,`participantId`);
