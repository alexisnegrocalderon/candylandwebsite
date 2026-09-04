CREATE TABLE `adminAuditLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(50),
	`targetId` varchar(64),
	`eventId` int,
	`payload` json,
	`ip` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adminAuditLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `adminAuditLog_created_idx` ON `adminAuditLog` (`createdAt`);--> statement-breakpoint
CREATE INDEX `adminAuditLog_action_idx` ON `adminAuditLog` (`action`);