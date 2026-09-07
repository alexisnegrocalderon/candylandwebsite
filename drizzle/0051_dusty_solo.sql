CREATE TABLE `pushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`label` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `pushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `adminAlertsConfig` json;