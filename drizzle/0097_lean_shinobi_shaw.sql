CREATE TABLE `taxPeriods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`status` enum('pendiente','declarado','pagado') NOT NULL DEFAULT 'pendiente',
	`declaredAt` timestamp,
	`paidAt` timestamp,
	`folio` varchar(40),
	`amountPaid` int,
	`remanente` int NOT NULL DEFAULT 0,
	`snapshot` json,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taxPeriods_id` PRIMARY KEY(`id`),
	CONSTRAINT `taxPeriods_monthKey_unique` UNIQUE(`monthKey`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `taxIssuer` enum('mansion','tercero','exento','por_revisar') DEFAULT 'por_revisar' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `taxNote` varchar(255);--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `siiConfig` json;