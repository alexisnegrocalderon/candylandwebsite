CREATE TABLE IF NOT EXISTS `playStations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`code` varchar(24) NOT NULL,
	`name` varchar(80) NOT NULL,
	`kind` varchar(12) NOT NULL DEFAULT 'cruzado',
	`points` int NOT NULL DEFAULT 10,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `playStations_id` PRIMARY KEY(`id`),
	UNIQUE KEY `play_stations_code_idx` (`code`),
	KEY `play_stations_event_idx` (`eventId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `playScores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`team` varchar(10) NOT NULL,
	`points` int NOT NULL,
	`label` varchar(120) NOT NULL DEFAULT '',
	`source` varchar(10) NOT NULL DEFAULT 'manual',
	`stationId` int NULL,
	`deviceKey` varchar(64) NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `playScores_id` PRIMARY KEY(`id`),
	KEY `play_scores_event_idx` (`eventId`),
	UNIQUE KEY `play_scores_device_idx` (`stationId`, `deviceKey`)
);
