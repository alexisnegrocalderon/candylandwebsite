ALTER TABLE `customers` ADD `mpCustomerId` varchar(64);--> statement-breakpoint
CREATE TABLE `memberPayTokens` (
	`nonce` varchar(32) NOT NULL,
	`email` varchar(320) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`usedOpId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memberPayTokens_nonce` PRIMARY KEY(`nonce`)
);--> statement-breakpoint
CREATE INDEX `member_pay_tokens_email_idx` ON `memberPayTokens` (`email`,`createdAt`);
