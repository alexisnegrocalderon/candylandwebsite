CREATE TABLE `panel_supervisors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`passwordHash` varchar(200),
	`totpSecret` varchar(64),
	`totpConfirmedAt` timestamp,
	`totpBackupCodes` json,
	`totpLastUsedStep` int,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `panel_supervisors_id` PRIMARY KEY(`id`)
);
