CREATE TABLE `adminTotp` (
	`id` int AUTO_INCREMENT NOT NULL,
	`secret` varchar(64) NOT NULL,
	`confirmedAt` timestamp,
	`backupCodes` json,
	`lastUsedStep` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `adminTotp_id` PRIMARY KEY(`id`)
);
