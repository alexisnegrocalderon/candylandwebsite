CREATE TABLE IF NOT EXISTS `crossChecks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(40) NOT NULL,
	`dedupeKey` varchar(160) NOT NULL,
	`eventId` int,
	`title` varchar(200) NOT NULL,
	`summary` varchar(1000) NOT NULL,
	`payload` json,
	`status` varchar(12) NOT NULL DEFAULT 'pending',
	`expiresAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp NULL,
	`result` varchar(1000),
	CONSTRAINT `crossChecks_id` PRIMARY KEY(`id`),
	UNIQUE KEY `cross_checks_dedupe_idx` (`dedupeKey`),
	KEY `cross_checks_status_idx` (`status`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `crossCheckConfig` (
	`kind` varchar(40) NOT NULL,
	`auto` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crossCheckConfig_kind` PRIMARY KEY(`kind`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `eventPilots` (
	`eventId` int NOT NULL,
	`status` varchar(8) NOT NULL DEFAULT 'on',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `eventPilots_eventId` PRIMARY KEY(`eventId`)
);
