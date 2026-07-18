CREATE TABLE `playcoinsLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`delta` int NOT NULL,
	`reason` enum('earn_web','earn_caja','redeem_caja','manual_adjust') NOT NULL,
	`orderId` int,
	`opId` varchar(36),
	`balanceAfter` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `playcoinsLedger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `playcoins` int DEFAULT 0 NOT NULL;