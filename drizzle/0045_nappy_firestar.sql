ALTER TABLE `events` ADD `tandaDiscountSchedule` json;--> statement-breakpoint
ALTER TABLE `events` ADD `tandaPhaseIndex` int DEFAULT 0 NOT NULL;