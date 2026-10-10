CREATE TABLE `staffMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`role` varchar(80),
	`defaultRateClp` int NOT NULL DEFAULT 0,
	`phone` varchar(40),
	`rut` varchar(20),
	`active` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staffMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staffShifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`staffId` int NOT NULL,
	`amountClp` int NOT NULL,
	`hours` decimal(5,1),
	`paid` int NOT NULL DEFAULT 0,
	`paidAt` timestamp,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staffShifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `staff_shifts_event_idx` ON `staffShifts` (`eventId`);--> statement-breakpoint
CREATE INDEX `staff_shifts_staff_idx` ON `staffShifts` (`staffId`);