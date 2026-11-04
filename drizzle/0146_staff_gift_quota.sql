CREATE TABLE IF NOT EXISTS `staffGiftQuota` (
	`staffId` int NOT NULL,
	`entradas` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staffGiftQuota_staffId` PRIMARY KEY(`staffId`)
);
