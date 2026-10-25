CREATE TABLE `solteroApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`status` enum('pendiente','aprobado','rechazado','revocado') NOT NULL DEFAULT 'pendiente',
	`fullName` varchar(255),
	`rut` varchar(20),
	`instagram` varchar(100),
	`phone` varchar(40),
	`referredBy` varchar(160),
	`message` varchar(500),
	`adminNote` varchar(500),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `solteroApprovals_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `soltero_approvals_email_idx` ON `solteroApprovals` (`email`);--> statement-breakpoint
CREATE INDEX `soltero_approvals_status_idx` ON `solteroApprovals` (`status`);
