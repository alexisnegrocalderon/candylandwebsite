CREATE TABLE `igFollowUps` (
	`threadId` int NOT NULL,
	`stage` int NOT NULL DEFAULT 0,
	`lastSentAt` timestamp,
	`stoppedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `igFollowUps_threadId` PRIMARY KEY(`threadId`)
);
