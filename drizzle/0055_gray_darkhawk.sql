CREATE TABLE `mailingSendLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(30) NOT NULL,
	`source` enum('founders-promo','manual') NOT NULL,
	`label` varchar(255) NOT NULL,
	`customerId` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`success` int NOT NULL,
	`reason` varchar(500),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mailingSendLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mailing_send_log_batch_idx` ON `mailingSendLog` (`batchId`);--> statement-breakpoint
CREATE INDEX `mailing_send_log_sent_at_idx` ON `mailingSendLog` (`sentAt`);