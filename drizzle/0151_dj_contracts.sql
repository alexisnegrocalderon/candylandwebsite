CREATE TABLE IF NOT EXISTS `djContracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'borrador',
	`artistName` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(40),
	`terms` json NOT NULL,
	`legalName` varchar(160),
	`rut` varchar(20),
	`bank` varchar(300),
	`clauseVersion` varchar(16),
	`clauseHash` varchar(64),
	`bodyText` mediumtext,
	`signatureImage` mediumtext,
	`signedAt` timestamp NULL,
	`signedIp` varchar(64),
	`signedUserAgent` varchar(255),
	`staffShiftId` int,
	`producersSig` mediumtext,
	`sentAt` timestamp NULL,
	`viewedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `djContracts_id` PRIMARY KEY(`id`),
	KEY `dj_contracts_event_idx` (`eventId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `producerSignatures` (
	`key` varchar(16) NOT NULL,
	`image` mediumtext NOT NULL,
	`signedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `producerSignatures_key` PRIMARY KEY(`key`)
);
