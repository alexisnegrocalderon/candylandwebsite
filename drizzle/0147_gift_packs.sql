CREATE TABLE IF NOT EXISTS `giftPacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`data` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `giftPacks_id` PRIMARY KEY(`id`),
	UNIQUE KEY `gift_packs_name_idx` (`name`)
);
