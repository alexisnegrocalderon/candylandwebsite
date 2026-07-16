ALTER TABLE `orders` ADD `serviceFee` decimal DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `serviceFeePercent` decimal(5,2) DEFAULT '0' NOT NULL;