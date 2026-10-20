ALTER TABLE `contestWinners` MODIFY COLUMN `status` enum('alternate','verifying','review','notified','choosing','delivered','expired','skipped','rejected') NOT NULL;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `verifyRut` varchar(20);--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `verifyBirthDate` varchar(10);--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `verifyAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `verifyNote` varchar(500);--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `verifiedAt` timestamp;
