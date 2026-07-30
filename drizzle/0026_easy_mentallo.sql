CREATE TABLE `ambassadorApplications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`whatsapp` varchar(20) NOT NULL,
	`instagram` varchar(100) NOT NULL,
	`followers` int,
	`message` text,
	`acceptedTerms` int NOT NULL DEFAULT 0,
	`status` enum('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAmbassadorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ambassadorApplications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ambassadorApplications_email_idx` ON `ambassadorApplications` (`email`);--> statement-breakpoint
CREATE INDEX `ambassadorApplications_status_idx` ON `ambassadorApplications` (`status`);