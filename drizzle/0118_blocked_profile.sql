ALTER TABLE `blockedCustomers` DROP INDEX `blockedCustomers_rut_unique`;--> statement-breakpoint
ALTER TABLE `blockedCustomers` MODIFY COLUMN `rut` varchar(20) NULL;--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `phone` varchar(40);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `instagram` varchar(100);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `rutNorm` varchar(20);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `emailNorm` varchar(320);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `phoneNorm` varchar(20);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `igNorm` varchar(40);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `nameFold` varchar(255);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `sourceVenue` varchar(120);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `sourceProducer` varchar(120);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `blockedOn` varchar(10);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `sourceBy` varchar(120);--> statement-breakpoint
ALTER TABLE `blockedCustomers` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `blocked_rut_norm_idx` ON `blockedCustomers` (`rutNorm`);--> statement-breakpoint
CREATE INDEX `blocked_email_norm_idx` ON `blockedCustomers` (`emailNorm`);--> statement-breakpoint
CREATE INDEX `blocked_phone_norm_idx` ON `blockedCustomers` (`phoneNorm`);--> statement-breakpoint
CREATE INDEX `blocked_ig_norm_idx` ON `blockedCustomers` (`igNorm`);--> statement-breakpoint
CREATE INDEX `blocked_name_fold_idx` ON `blockedCustomers` (`nameFold`);--> statement-breakpoint
UPDATE `blockedCustomers` SET `rutNorm` = UPPER(REPLACE(REPLACE(REPLACE(`rut`, '.', ''), '-', ''), ' ', '')) WHERE `rut` IS NOT NULL;
