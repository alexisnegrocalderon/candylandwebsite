CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`enrollCode` varchar(16),
	`enrollCodeExpiresAt` timestamp,
	`deviceTokenHash` varchar(255),
	`enrolled` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_enrollCode_unique` UNIQUE(`enrollCode`)
);
