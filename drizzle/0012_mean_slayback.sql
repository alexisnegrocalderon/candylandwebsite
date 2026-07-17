ALTER TABLE `operators` ADD `failedPinAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `operators` ADD `lockedUntil` timestamp;