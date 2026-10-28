ALTER TABLE `partyProfiles` ADD `superLikeCredits` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `superLikeBought` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `superLikeCap` int;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `likesUnlocked` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `partyProfiles` ADD `affinityAlerts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE `partyCharges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`profileId` int NOT NULL,
	`kind` enum('superlike','likes_unlock','gift','return','cap') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`amountClp` int NOT NULL DEFAULT 0,
	`coins` int NOT NULL DEFAULT 0,
	`saldo` int NOT NULL DEFAULT 0,
	`opId` varchar(40),
	`note` varchar(200),
	`actor` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyCharges_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `party_charges_op_idx` ON `partyCharges` (`opId`);--> statement-breakpoint
CREATE INDEX `party_charges_event_idx` ON `partyCharges` (`eventId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `party_charges_profile_idx` ON `partyCharges` (`profileId`);--> statement-breakpoint
CREATE TABLE `partyEventConfig` (
	`eventId` int NOT NULL,
	`config` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partyEventConfig_eventId` PRIMARY KEY(`eventId`)
);--> statement-breakpoint
ALTER TABLE `playcoinsLedger` MODIFY `reason` enum('earn_web','earn_caja','redeem_caja','manual_adjust','spend_playmatch') NOT NULL;--> statement-breakpoint
ALTER TABLE `prepaidLedger` MODIFY `reason` enum('topup_web','spend_caja','spend_puerta','refund','manual_adjust','spend_playmatch') NOT NULL;--> statement-breakpoint
ALTER TABLE `staffMembers` MODIFY `cargo` enum('caja','barra','puerta','cocina','guardarropia','supervisor','dj','rrpp','produccion','otro','anfitrion_playmatch');
