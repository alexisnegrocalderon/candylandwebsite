ALTER TABLE `orders` ADD `reminderSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `reminderCount` int DEFAULT 0 NOT NULL;