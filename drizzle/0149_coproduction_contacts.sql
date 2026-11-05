CREATE TABLE IF NOT EXISTS `coproductionContacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coproductionId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`fullName` varchar(255),
	`phone` varchar(40),
	`createdBy` enum('playroom','partner') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coproductionContacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coproduction_contacts_email_idx` ON `coproductionContacts` (`coproductionId`,`email`);
