CREATE TABLE `budgetSimulations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`eventId` int,
	`ivaApplies` int NOT NULL DEFAULT 0,
	`marginTargetPercent` decimal(5,2) NOT NULL,
	`cardFeePercent` decimal(5,2) NOT NULL DEFAULT '0',
	`commissionPercent` decimal(5,2) NOT NULL DEFAULT '0',
	`variableCostPerPerson` decimal NOT NULL DEFAULT '0',
	`otherRevenuePerPerson` decimal NOT NULL DEFAULT '0',
	`revenueTiers` json NOT NULL,
	`expenseLines` json NOT NULL,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgetSimulations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `budgetSimulations_event_idx` ON `budgetSimulations` (`eventId`);