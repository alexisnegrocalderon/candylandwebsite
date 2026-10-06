ALTER TABLE `customers` ADD `birthDate` varchar(10);--> statement-breakpoint
ALTER TABLE `customers` ADD `gender` enum('hombre','mujer','pareja','otro');--> statement-breakpoint
ALTER TABLE `customers` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `customers` ADD `emailOptOut` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `whatsappOptOut` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `optOutAt` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `optOutReason` varchar(200);--> statement-breakpoint
ALTER TABLE `customers` ADD `source` varchar(40);--> statement-breakpoint
ALTER TABLE `customers` ADD `ambassadorCode` varchar(32);--> statement-breakpoint
ALTER TABLE `customers` ADD `levelOverride` varchar(20);--> statement-breakpoint
ALTER TABLE `customers` ADD `lockedFields` json;