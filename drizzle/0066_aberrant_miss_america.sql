CREATE TABLE `waMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`wamid` varchar(191),
	`direction` enum('in','out') NOT NULL,
	`source` enum('user','bot','admin','owner_app') NOT NULL,
	`text` text,
	`interactive` json,
	`attachments` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `waMessages_wamid_unique` UNIQUE(`wamid`)
);
--> statement-breakpoint
CREATE TABLE `waThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`waId` varchar(32) NOT NULL,
	`profileName` varchar(255),
	`botPaused` int NOT NULL DEFAULT 0,
	`handoffReason` varchar(500),
	`lastInboundAt` timestamp,
	`lastMessageAt` timestamp,
	`lastMessagePreview` varchar(300),
	`unreadCount` int NOT NULL DEFAULT 0,
	`closingMessageSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `waThreads_id` PRIMARY KEY(`id`),
	CONSTRAINT `waThreads_waId_unique` UNIQUE(`waId`)
);
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `whatsappAgentConfig` json;--> statement-breakpoint
CREATE INDEX `wa_messages_thread_idx` ON `waMessages` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wa_threads_last_message_idx` ON `waThreads` (`lastMessageAt`);