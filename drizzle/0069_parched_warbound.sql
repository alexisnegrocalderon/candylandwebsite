ALTER TABLE `igThreads` ADD `botPausedAt` timestamp;--> statement-breakpoint
ALTER TABLE `igThreads` ADD `customerNotes` text;--> statement-breakpoint
ALTER TABLE `siteSettings` ADD `agentCoachReport` json;--> statement-breakpoint
ALTER TABLE `waThreads` ADD `botPausedAt` timestamp;--> statement-breakpoint
ALTER TABLE `waThreads` ADD `customerNotes` text;