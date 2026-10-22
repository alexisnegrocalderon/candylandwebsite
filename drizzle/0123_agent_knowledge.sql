ALTER TABLE `agentHandoffLog` ADD `outcome` varchar(16);--> statement-breakpoint
CREATE TABLE `agentKnowledge` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` varchar(1000) NOT NULL,
	`topic` varchar(16) NOT NULL DEFAULT 'general',
	`source` varchar(12) NOT NULL,
	`status` varchar(10) NOT NULL DEFAULT 'activo',
	`handoffId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agentKnowledge_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `agent_knowledge_status_idx` ON `agentKnowledge` (`status`,`updatedAt`);
