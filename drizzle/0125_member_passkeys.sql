CREATE TABLE `memberPasskeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`credentialId` varchar(255) NOT NULL,
	`publicKey` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`transports` json,
	`deviceLabel` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `memberPasskeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `memberPasskeys_credentialId_unique` UNIQUE(`credentialId`)
);--> statement-breakpoint
CREATE INDEX `member_passkeys_email_idx` ON `memberPasskeys` (`email`);
