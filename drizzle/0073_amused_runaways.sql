CREATE TABLE `eventSurveySettings` (
	`eventId` int NOT NULL,
	`autoSend` int NOT NULL DEFAULT 0,
	`report` json,
	`reportAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `eventSurveySettings_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `eventSurveys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`buyerEmail` varchar(320) NOT NULL,
	`buyerName` varchar(255),
	`sentAt` timestamp,
	`sendAttempts` int NOT NULL DEFAULT 0,
	`respondedAt` timestamp,
	`rating` int,
	`liked` text,
	`improve` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eventSurveys_id` PRIMARY KEY(`id`),
	CONSTRAINT `eventSurveys_token_unique` UNIQUE(`token`),
	CONSTRAINT `eventSurveys_event_email_idx` UNIQUE(`eventId`,`buyerEmail`)
);
