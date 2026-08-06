CREATE TABLE `blockedCustomers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rut` varchar(20) NOT NULL,
	`fullName` varchar(255),
	`reason` varchar(500),
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blockedCustomers_id` PRIMARY KEY(`id`),
	CONSTRAINT `blockedCustomers_rut_unique` UNIQUE(`rut`)
);
