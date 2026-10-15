CREATE TABLE `igLinkClicks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`origin` varchar(100) NOT NULL,
	`path` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `igLinkClicks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `igComments` ADD `dmButton` varchar(200);--> statement-breakpoint
CREATE INDEX `ig_link_clicks_origin_idx` ON `igLinkClicks` (`origin`);--> statement-breakpoint
CREATE INDEX `ig_link_clicks_created_idx` ON `igLinkClicks` (`createdAt`);