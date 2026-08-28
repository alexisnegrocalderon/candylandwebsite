CREATE TABLE `adminWebauthnCredentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`credentialId` varchar(255) NOT NULL,
	`publicKey` text NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`transports` json,
	`deviceLabel` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `adminWebauthnCredentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `adminWebauthnCredentials_credentialId_unique` UNIQUE(`credentialId`)
);
