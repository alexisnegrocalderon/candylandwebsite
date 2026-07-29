CREATE TABLE `ambassadorCommissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambassadorId` int NOT NULL,
	`orderId` int NOT NULL,
	`eventId` int NOT NULL,
	`baseAmount` decimal NOT NULL,
	`commissionPercent` decimal(5,2) NOT NULL,
	`commissionAmount` decimal NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ambassadorCommissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exclusiveAmbassadors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`code` varchar(32) NOT NULL,
	`commissionPercent` decimal(5,2) NOT NULL,
	`contact` varchar(255),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exclusiveAmbassadors_id` PRIMARY KEY(`id`),
	CONSTRAINT `exclusiveAmbassadors_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `referredByCode` varchar(32);