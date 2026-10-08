CREATE TABLE `contentDesigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int,
	`title` varchar(200) NOT NULL,
	`format` enum('carrusel','post','historia') NOT NULL,
	`theme` varchar(30) NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contentDesigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `content_designs_event_idx` ON `contentDesigns` (`eventId`);