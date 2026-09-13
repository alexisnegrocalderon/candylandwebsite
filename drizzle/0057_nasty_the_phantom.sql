CREATE TABLE `igMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`mid` varchar(191),
	`direction` enum('in','out') NOT NULL,
	`source` enum('user','bot','admin') NOT NULL,
	`text` text,
	`attachments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `igMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `igMessages_mid_unique` UNIQUE(`mid`)
);
--> statement-breakpoint
CREATE TABLE `igThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`igUserId` varchar(64) NOT NULL,
	`username` varchar(120),
	`name` varchar(255),
	`botPaused` int NOT NULL DEFAULT 0,
	`handoffReason` varchar(500),
	`lastInboundAt` timestamp,
	`lastMessageAt` timestamp,
	`lastMessagePreview` varchar(300),
	`unreadCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `igThreads_id` PRIMARY KEY(`id`),
	CONSTRAINT `igThreads_igUserId_unique` UNIQUE(`igUserId`)
);
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `instagramAgentConfig` json;--> statement-breakpoint
CREATE INDEX `ig_messages_thread_idx` ON `igMessages` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ig_threads_last_message_idx` ON `igThreads` (`lastMessageAt`);