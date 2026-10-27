ALTER TABLE `partyProfiles` MODIFY `gender` enum('hombre','mujer','pareja','no_binario') NOT NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `pairType` enum('mixta','chicas','chicos');--> statement-breakpoint
ALTER TABLE `partyProfiles` MODIFY `lookingFor` varchar(128) NOT NULL DEFAULT 'hombre,mujer,pareja';--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `orientation` varchar(16);--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `relationStyle` varchar(16);--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `intents` varchar(160);
