CREATE TABLE IF NOT EXISTS `assistantThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assistantThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assistantMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`role` varchar(12) NOT NULL,
	`api` json NOT NULL,
	`ui` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistantMessages_id` PRIMARY KEY(`id`),
	KEY `assistant_messages_thread_idx` (`threadId`,`id`)
);
