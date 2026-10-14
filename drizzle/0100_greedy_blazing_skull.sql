ALTER TABLE `orders` ADD `refundAmount` decimal;--> statement-breakpoint
ALTER TABLE `orders` ADD `refundPercent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `orders` ADD `refundReason` varchar(500);--> statement-breakpoint
ALTER TABLE `orders` ADD `refundedAt` timestamp;