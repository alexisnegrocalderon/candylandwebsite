ALTER TABLE `events` ADD `memberEarlyUntil` timestamp NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `memberSince` timestamp NULL;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `memberConfig` json;--> statement-breakpoint
CREATE TABLE `memberCoupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`discountCodeId` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`title` varchar(120) NOT NULL,
	`grantKey` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memberCoupons_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `member_coupons_key_idx` ON `memberCoupons` (`grantKey`);--> statement-breakpoint
CREATE INDEX `member_coupons_email_idx` ON `memberCoupons` (`email`);
