CREATE TABLE `partyBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`blockerProfileId` int NOT NULL,
	`blockedProfileId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyBlocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `party_blocks_pair_idx` UNIQUE(`blockerProfileId`,`blockedProfileId`)
);
--> statement-breakpoint
CREATE TABLE `partyConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`profileLowId` int NOT NULL,
	`profileHighId` int NOT NULL,
	`initiatedById` int NOT NULL,
	`status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	CONSTRAINT `partyConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `party_connections_pair_idx` UNIQUE(`profileLowId`,`profileHighId`)
);
--> statement-breakpoint
CREATE TABLE `partyMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connectionId` int NOT NULL,
	`fromProfileId` int NOT NULL,
	`body` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partyProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`ticketId` int NOT NULL,
	`alias` varchar(32) NOT NULL,
	`gender` enum('hombre','mujer','pareja') NOT NULL,
	`avatarId` int NOT NULL,
	`zone` enum('living','playground','piscina','barra') NOT NULL DEFAULT 'living',
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `partyProfiles_ticketId_unique` UNIQUE(`ticketId`)
);
--> statement-breakpoint
CREATE TABLE `partyReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`reporterProfileId` int NOT NULL,
	`reportedProfileId` int NOT NULL,
	`reason` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `partyReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `party_connections_low_idx` ON `partyConnections` (`profileLowId`);--> statement-breakpoint
CREATE INDEX `party_connections_high_idx` ON `partyConnections` (`profileHighId`);--> statement-breakpoint
CREATE INDEX `party_messages_connection_idx` ON `partyMessages` (`connectionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `party_profiles_event_active_idx` ON `partyProfiles` (`eventId`,`active`);--> statement-breakpoint
CREATE INDEX `party_reports_event_idx` ON `partyReports` (`eventId`,`resolvedAt`);