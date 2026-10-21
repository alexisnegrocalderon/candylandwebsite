CREATE TABLE `attendee_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rut` varchar(20),
	`matchKey` varchar(320) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`docType` varchar(16) NOT NULL DEFAULT 'rut',
	`buyerEmail` varchar(320),
	`buyerName` varchar(255),
	`firstOrderId` int,
	`lastOrderId` int,
	`orderIds` json,
	`eventIds` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendee_contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendee_contacts_match_key_idx` UNIQUE(`matchKey`)
);
