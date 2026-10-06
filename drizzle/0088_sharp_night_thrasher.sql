CREATE TABLE `accessCredits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`accesoSlug` varchar(50) NOT NULL,
	`accesoName` varchar(100) NOT NULL,
	`buyerEmail` varchar(320) NOT NULL,
	`buyerName` varchar(255),
	`originOrderId` int NOT NULL,
	`originEventId` int NOT NULL,
	`status` enum('available','reserved','used','cancelled') NOT NULL DEFAULT 'available',
	`usedOrderId` int,
	`reservedAt` timestamp,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessCredits_id` PRIMARY KEY(`id`),
	CONSTRAINT `accessCredits_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `access_credits_origin_order_idx` ON `accessCredits` (`originOrderId`);--> statement-breakpoint
CREATE INDEX `access_credits_email_idx` ON `accessCredits` (`buyerEmail`);