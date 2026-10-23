ALTER TABLE `partyProfiles` ADD `lookingFor` varchar(32) DEFAULT 'hombre,mujer,pareja' NOT NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `costume` varchar(40);--> statement-breakpoint
ALTER TABLE `partyPhotos` ADD `position` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `party_photos_profile_position_idx` ON `partyPhotos` (`profileId`,`position`);--> statement-breakpoint
ALTER TABLE `partyPhotos` DROP INDEX `partyPhotos_profileId_unique`;
