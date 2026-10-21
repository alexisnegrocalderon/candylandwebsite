ALTER TABLE `contestParticipants` MODIFY COLUMN `source` enum('comment','story','dm','purchase') NOT NULL;--> statement-breakpoint
ALTER TABLE `contestParticipants` ADD `lockedPhasePercent` int;--> statement-breakpoint
ALTER TABLE `contestWinners` MODIFY COLUMN `status` enum('alternate','notified','choosing','delivered','expired','skipped') NOT NULL;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `orderId` int;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `choice` enum('refund','gift');--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `choiceToken` varchar(32);--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `choiceDeadline` timestamp;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `refundAmount` int;--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `refundStatus` enum('pending','done');--> statement-breakpoint
ALTER TABLE `contestWinners` ADD `refundedAt` timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX `contest_winners_choice_token_idx` ON `contestWinners` (`choiceToken`);
