CREATE TABLE `partyGifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`fromProfileId` int NOT NULL,
	`toProfileId` int NOT NULL,
	`ticketTypeId` int NOT NULL,
	`drinkName` varchar(100) NOT NULL,
	`priceClp` decimal NOT NULL,
	`message` varchar(120),
	`status` enum('invited','accepted','declined','paid','redeemed','expired') NOT NULL DEFAULT 'invited',
	`orderId` int,
	`ticketId` int,
	`displayCode` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`respondedAt` timestamp,
	`paidAt` timestamp,
	`redeemedAt` timestamp,
	CONSTRAINT `partyGifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `party_gifts_to_idx` ON `partyGifts` (`toProfileId`,`status`);--> statement-breakpoint
CREATE INDEX `party_gifts_from_idx` ON `partyGifts` (`fromProfileId`,`status`);--> statement-breakpoint
CREATE INDEX `party_gifts_status_idx` ON `partyGifts` (`status`);--> statement-breakpoint
CREATE INDEX `party_gifts_order_idx` ON `partyGifts` (`orderId`);