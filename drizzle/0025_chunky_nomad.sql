CREATE TABLE `ambassadorBenefitDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambassadorId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`benefitKey` varchar(64) NOT NULL,
	`note` text,
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ambassadorBenefitDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `ambassadorBenefitDeliveries_unique` UNIQUE(`ambassadorId`,`monthKey`,`benefitKey`)
);
--> statement-breakpoint
CREATE TABLE `ambassadorWeeklyMaterial` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255),
	`storiesText` text,
	`reelText` text,
	`postText` text,
	`countdownText` text,
	`linkUrl` varchar(500),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ambassadorWeeklyMaterial_id` PRIMARY KEY(`id`)
);
