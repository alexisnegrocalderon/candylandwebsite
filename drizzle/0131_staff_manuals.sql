CREATE TABLE `staffManuals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manualKey` varchar(24) NOT NULL,
	`version` int NOT NULL,
	`title` varchar(120) NOT NULL,
	`sections` json NOT NULL,
	`changeNote` varchar(255),
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffManuals_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_manuals_key_version_idx` ON `staffManuals` (`manualKey`,`version`);--> statement-breakpoint
CREATE TABLE `staffManualAcceptances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffId` int NOT NULL,
	`manualKey` varchar(24) NOT NULL,
	`version` int NOT NULL,
	`fullName` varchar(120) NOT NULL,
	`rut` varchar(20),
	`userAgent` varchar(255),
	`ip` varchar(64),
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staffManualAcceptances_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `staff_manual_accept_idx` ON `staffManualAcceptances` (`staffId`,`manualKey`,`version`);--> statement-breakpoint
CREATE INDEX `staff_manual_accept_staff_idx` ON `staffManualAcceptances` (`staffId`);
