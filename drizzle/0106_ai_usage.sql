CREATE TABLE `aiUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`feature` varchar(60) NOT NULL,
	`model` varchar(60) NOT NULL,
	`inputTokens` int NOT NULL DEFAULT 0,
	`outputTokens` int NOT NULL DEFAULT 0,
	`cacheReadTokens` int NOT NULL DEFAULT 0,
	`cacheWriteTokens` int NOT NULL DEFAULT 0,
	`costMicroUsd` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiUsage_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `aiUsage` (`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_usage_feature_idx` ON `aiUsage` (`feature`);
