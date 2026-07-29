CREATE TABLE `ambassadorClients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambassadorId` int NOT NULL,
	`customerEmail` varchar(320) NOT NULL,
	`firstOrderId` int,
	`firstPurchaseAt` timestamp NOT NULL DEFAULT (now()),
	`ordersCount` int NOT NULL DEFAULT 1,
	`totalSpent` decimal NOT NULL DEFAULT '0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ambassadorClients_id` PRIMARY KEY(`id`),
	CONSTRAINT `ambassadorClients_customerEmail_unique` UNIQUE(`customerEmail`)
);
--> statement-breakpoint
CREATE TABLE `ambassadorProgramConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`launchDate` timestamp NOT NULL DEFAULT (now()),
	`commissionScale` json,
	`existingClientPercent` decimal(5,2) NOT NULL DEFAULT '10',
	`benefits` json,
	`weeklyEmailEnabled` int NOT NULL DEFAULT 1,
	`weeklyEmailWeekday` int NOT NULL DEFAULT 1,
	`weeklyEmailHourChile` int NOT NULL DEFAULT 9,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ambassadorProgramConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `exclusiveAmbassadors` MODIFY COLUMN `eventId` int;--> statement-breakpoint
ALTER TABLE `exclusiveAmbassadors` MODIFY COLUMN `commissionPercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD `customerEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD `clientType` enum('exclusivo','existente') DEFAULT 'exclusivo' NOT NULL;--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD `codeUsed` varchar(32);--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD `monthKey` varchar(7);--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD `salesRank` int;--> statement-breakpoint
ALTER TABLE `exclusiveAmbassadors` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `exclusiveAmbassadors` ADD `instagram` varchar(100);--> statement-breakpoint
ALTER TABLE `ambassadorCommissions` ADD CONSTRAINT `ambassadorCommissions_orderId_unique` UNIQUE(`orderId`);