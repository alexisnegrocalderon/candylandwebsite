CREATE TABLE `taxRegularizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`status` enum('pendiente','rectificado','en_convenio','regularizado') NOT NULL DEFAULT 'pendiente',
	`folio` varchar(40),
	`installments` int,
	`note` varchar(500),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taxRegularizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `taxRegularizations_monthKey_unique` UNIQUE(`monthKey`)
);
