ALTER TABLE `igLinkClicks` ADD `threadId` int;--> statement-breakpoint
CREATE INDEX `ig_link_clicks_thread_idx` ON `igLinkClicks` (`threadId`);
