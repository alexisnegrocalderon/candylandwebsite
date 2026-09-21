CREATE TABLE `birthdayApplications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`whatsapp` varchar(20) NOT NULL,
	`instagram` varchar(100),
	`birthDate` varchar(10) NOT NULL,
	`message` text,
	`acceptedTerms` int NOT NULL DEFAULT 0,
	`status` enum('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdBirthdayPersonId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `birthdayApplications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `birthdayPeople` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicationId` int NOT NULL,
	`eventId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`whatsapp` varchar(20) NOT NULL,
	`birthDate` varchar(10) NOT NULL,
	`discountCodeId` int NOT NULL,
	`currentTier` int NOT NULL DEFAULT 0,
	`pendingNextEventCredit` int NOT NULL DEFAULT 0,
	`pendingCreditRedeemedEventId` int,
	`rewardOrderId` int,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `birthdayPeople_id` PRIMARY KEY(`id`),
	CONSTRAINT `birthdayPeople_application_idx` UNIQUE(`applicationId`),
	CONSTRAINT `birthdayPeople_discountCode_idx` UNIQUE(`discountCodeId`)
);
--> statement-breakpoint
CREATE INDEX `birthdayApplications_email_idx` ON `birthdayApplications` (`email`);--> statement-breakpoint
CREATE INDEX `birthdayApplications_event_idx` ON `birthdayApplications` (`eventId`);--> statement-breakpoint
CREATE INDEX `birthdayApplications_status_idx` ON `birthdayApplications` (`status`);--> statement-breakpoint
CREATE INDEX `birthdayPeople_event_idx` ON `birthdayPeople` (`eventId`);