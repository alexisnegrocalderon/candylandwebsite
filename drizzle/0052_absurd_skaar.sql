CREATE TABLE `partyPushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`eventId` int NOT NULL,
	`endpoint` varchar(512) NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partyPushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `partyPushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE INDEX `party_push_subscriptions_event_idx` ON `partyPushSubscriptions` (`eventId`);--> statement-breakpoint
CREATE INDEX `party_push_subscriptions_profile_idx` ON `partyPushSubscriptions` (`profileId`);