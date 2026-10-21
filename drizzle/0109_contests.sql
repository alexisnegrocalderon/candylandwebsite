CREATE TABLE `contests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`eventId` int NOT NULL,
	`status` enum('draft','active','paused','finished') NOT NULL DEFAULT 'draft',
	`mediaId` varchar(64),
	`mediaPermalink` varchar(300),
	`mediaImage` text,
	`config` json,
	`drawLog` json,
	`drawnAt` timestamp,
	`lastSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contests_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE `contestParticipants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contestId` int NOT NULL,
	`igUserId` varchar(64) NOT NULL,
	`username` varchar(120),
	`source` enum('comment','story','dm') NOT NULL,
	`firstCommentId` varchar(64),
	`spareCommentId` varchar(64),
	`spareCommentAt` timestamp,
	`mentions` json,
	`storyMentioned` int NOT NULL DEFAULT 0,
	`invitedPurchases` int NOT NULL DEFAULT 0,
	`hasTicket` int NOT NULL DEFAULT 0,
	`boughtDuringContest` int NOT NULL DEFAULT 0,
	`email` varchar(320),
	`orderId` int,
	`couponCode` varchar(50),
	`friendCode` varchar(50),
	`inviteCode` varchar(16) NOT NULL,
	`holderPrizesAt` timestamp,
	`awaitingEmail` int NOT NULL DEFAULT 0,
	`disqualified` int NOT NULL DEFAULT 0,
	`disqualifyReason` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contestParticipants_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `contest_participants_user_idx` ON `contestParticipants` (`contestId`,`igUserId`);--> statement-breakpoint
CREATE UNIQUE INDEX `contest_participants_invite_idx` ON `contestParticipants` (`inviteCode`);--> statement-breakpoint
CREATE INDEX `contest_participants_username_idx` ON `contestParticipants` (`username`);--> statement-breakpoint
CREATE TABLE `contestWinners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contestId` int NOT NULL,
	`participantId` int NOT NULL,
	`pool` enum('double','vip') NOT NULL,
	`position` int NOT NULL,
	`chances` int NOT NULL,
	`status` enum('alternate','notified','delivered','expired','skipped') NOT NULL,
	`prizeCode` varchar(50),
	`claimDeadline` timestamp,
	`notifiedAt` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contestWinners_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `contest_winners_contest_idx` ON `contestWinners` (`contestId`);--> statement-breakpoint
CREATE TABLE `contestLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contestId` int NOT NULL,
	`kind` enum('comment','story','order') NOT NULL,
	`refId` varchar(100) NOT NULL,
	`participantId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contestLog_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `contest_log_ref_idx` ON `contestLog` (`contestId`,`kind`,`refId`);
