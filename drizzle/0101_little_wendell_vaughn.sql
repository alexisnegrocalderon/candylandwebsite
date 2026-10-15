CREATE TABLE `igComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commentId` varchar(64) NOT NULL,
	`mediaId` varchar(64),
	`igUserId` varchar(64) NOT NULL,
	`username` varchar(120),
	`text` text NOT NULL,
	`category` varchar(12) NOT NULL,
	`draftReply` text,
	`draftDm` text,
	`finalReply` text,
	`status` enum('pending','sent','discarded','hidden','failed') NOT NULL DEFAULT 'pending',
	`error` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `igComments_id` PRIMARY KEY(`id`),
	CONSTRAINT `ig_comments_comment_idx` UNIQUE(`commentId`)
);
--> statement-breakpoint
CREATE INDEX `ig_comments_status_idx` ON `igComments` (`status`);