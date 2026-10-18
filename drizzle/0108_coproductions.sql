CREATE TABLE `coproductions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(50) NOT NULL,
	`partnerName` varchar(100) NOT NULL,
	`eventId` int,
	`splitPercentPartner` int NOT NULL DEFAULT 50,
	`isLive` int NOT NULL DEFAULT 0,
	`previewToken` varchar(64) NOT NULL,
	`passwordHash` varchar(200),
	`totpSecret` varchar(64),
	`totpConfirmedAt` timestamp,
	`totpBackupCodes` json,
	`totpLastUsedStep` int,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`landing` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coproductions_id` PRIMARY KEY(`id`),
	CONSTRAINT `coproductions_slug_unique` UNIQUE(`slug`)
);--> statement-breakpoint
CREATE TABLE `coproductionInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coproductionId` int NOT NULL,
	`orderId` int NOT NULL,
	`createdBy` enum('playroom','partner') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coproductionInvites_id` PRIMARY KEY(`id`),
	CONSTRAINT `coproductionInvites_orderId_unique` UNIQUE(`orderId`)
);--> statement-breakpoint
CREATE INDEX `coproduction_invites_coproduction_idx` ON `coproductionInvites` (`coproductionId`);--> statement-breakpoint
CREATE TABLE `coproductionExpenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coproductionId` int NOT NULL,
	`submittedBy` enum('playroom','partner') NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`category` varchar(20) NOT NULL,
	`description` varchar(255) NOT NULL,
	`supplier` varchar(160),
	`documentType` varchar(20) NOT NULL,
	`amountTotal` int NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`receiptUrl` text,
	`rejectReason` varchar(255),
	`expenseId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coproductionExpenses_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `coproduction_expenses_coproduction_idx` ON `coproductionExpenses` (`coproductionId`);--> statement-breakpoint
INSERT INTO `coproductions` (`slug`, `partnerName`, `splitPercentPartner`, `isLive`, `previewToken`)
VALUES ('dalmore', 'Dalmore', 50, 0, REPLACE(UUID(), '-', ''));
