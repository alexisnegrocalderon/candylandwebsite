-- Campañas de mail programadas: hora de envío, audiencia que se resuelve al llegar la hora y eventos de Resend
-- (rebotes, quejas, aperturas y clics). Solo agrega columnas nulas y una tabla: no cambia datos existentes.
ALTER TABLE `mailingCampaigns` ADD `scheduledAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `mailingCampaigns` ADD `audienceFilters` json;
--> statement-breakpoint
ALTER TABLE `mailingCampaigns` MODIFY `status` enum('sending','done','cancelled','scheduled') NOT NULL DEFAULT 'sending';
--> statement-breakpoint
CREATE TABLE `emailEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`svixId` varchar(100) NOT NULL,
	`resendId` varchar(64),
	`type` varchar(40) NOT NULL,
	`email` varchar(320) NOT NULL,
	`campaign` varchar(255),
	`variant` varchar(4),
	`url` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emailEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_events_svix_idx` UNIQUE(`svixId`)
);
--> statement-breakpoint
CREATE INDEX `email_events_campaign_idx` ON `emailEvents` (`campaign`,`type`);
--> statement-breakpoint
CREATE INDEX `email_events_email_idx` ON `emailEvents` (`email`);
