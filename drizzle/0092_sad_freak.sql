CREATE TABLE `contentDesignMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`designId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`text` text NOT NULL,
	`images` json,
	`model` varchar(60),
	`usage` json,
	`costUsd` decimal(10,4),
	`snapshot` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contentDesignMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contentDesigns` ADD `kind` varchar(20) DEFAULT 'plantilla' NOT NULL;--> statement-breakpoint
CREATE INDEX `content_design_messages_design_idx` ON `contentDesignMessages` (`designId`);