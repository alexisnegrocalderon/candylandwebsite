CREATE TABLE `appDevices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(64) NOT NULL,
	`platform` varchar(10) NOT NULL,
	`email` varchar(320),
	`emailNorm` varchar(320),
	`orderId` int,
	`opens` int NOT NULL DEFAULT 1,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appDevices_id` PRIMARY KEY(`id`),
	CONSTRAINT `appDevices_deviceId_unique` UNIQUE(`deviceId`)
);--> statement-breakpoint
CREATE INDEX `app_devices_email_idx` ON `appDevices` (`emailNorm`);--> statement-breakpoint
CREATE INDEX `app_devices_last_seen_idx` ON `appDevices` (`lastSeenAt`);
