CREATE TABLE `agentHandoffLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel` enum('instagram','whatsapp') NOT NULL,
	`threadId` int NOT NULL,
	`who` varchar(255) NOT NULL,
	`incomingText` varchar(2000) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentHandoffLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `agent_handoff_log_pending_idx` ON `agentHandoffLog` (`resolvedAt`,`createdAt`);