CREATE TABLE `rateLimits` (
	`key` varchar(128) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rateLimits_key` PRIMARY KEY(`key`)
);
