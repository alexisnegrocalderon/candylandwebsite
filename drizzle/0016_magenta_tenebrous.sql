CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`fullName` varchar(255),
	`phone` varchar(20),
	`rut` varchar(20),
	`instagram` varchar(100),
	`accessTypes` json,
	`tags` json,
	`totalOrders` int NOT NULL DEFAULT 0,
	`totalSpent` decimal NOT NULL DEFAULT '0',
	`notes` text,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_email_unique` UNIQUE(`email`)
);
