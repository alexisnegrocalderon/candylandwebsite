ALTER TABLE `ambassadorProgramConfig` ADD `generalBuyerDiscountEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ambassadorProgramConfig` ADD `generalBuyerDiscountPercent` decimal(5,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `ambassadorProgramConfig` ADD `generalBuyerDiscountEndsAt` timestamp;
