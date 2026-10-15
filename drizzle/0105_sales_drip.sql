ALTER TABLE `siteSettings` ADD `salesDripEnabled` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `salesDripIntervalDays` int DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `mailingSendLog` MODIFY COLUMN `source` enum('founders-promo','tanda2-promo','sales-drip','manual') NOT NULL;--> statement-breakpoint
ALTER TABLE `mailingSendLog` ADD `eventId` int;--> statement-breakpoint
CREATE INDEX `mailing_send_log_event_customer_idx` ON `mailingSendLog` (`eventId`,`customerId`);--> statement-breakpoint
UPDATE `siteSettings` SET `foundersPromoEnabled` = 0, `tanda2PromoEnabled` = 0;
