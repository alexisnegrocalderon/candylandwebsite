ALTER TABLE `siteSettings` ADD `cardFeePercent` decimal(5,2) DEFAULT '3.50' NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `parkingVenueFeeClp` int DEFAULT 3000 NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `foundersPromoEnabled` int DEFAULT 0 NOT NULL;