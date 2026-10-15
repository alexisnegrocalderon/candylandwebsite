CREATE TABLE `igReferrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`igUserId` varchar(64) NOT NULL,
	`source` varchar(12) NOT NULL,
	`ref` varchar(120),
	`adTitle` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `igReferrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ig_referrals_user_idx` ON `igReferrals` (`igUserId`);--> statement-breakpoint
CREATE INDEX `ig_referrals_created_idx` ON `igReferrals` (`createdAt`);