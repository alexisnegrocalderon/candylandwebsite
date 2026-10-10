CREATE TABLE `accountBalances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` enum('mercadopago','banco') NOT NULL,
	`balanceClp` int NOT NULL,
	`asOf` timestamp NOT NULL,
	`origin` enum('api','cartola','manual') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accountBalances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `accountMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` enum('mercadopago','banco') NOT NULL,
	`externalId` varchar(120) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`amountClp` int NOT NULL,
	`description` varchar(255),
	`kind` varchar(40),
	`classification` enum('venta','comision','gasto_evento','gasto_empresa','retiro_dueno','traspaso','otro','por_clasificar') NOT NULL DEFAULT 'por_clasificar',
	`eventId` int,
	`expenseId` int,
	`withdrawalId` int,
	`balanceAfter` int,
	`raw` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accountMovements_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_movements_source_ext_unique` UNIQUE(`source`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `ownerWithdrawals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`withdrawnAt` timestamp NOT NULL,
	`amountClp` int NOT NULL,
	`account` enum('mercadopago','banco','efectivo') NOT NULL DEFAULT 'mercadopago',
	`note` varchar(255),
	`movementId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ownerWithdrawals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `slotKey` varchar(32);--> statement-breakpoint
CREATE INDEX `account_balances_source_idx` ON `accountBalances` (`source`,`asOf`);--> statement-breakpoint
CREATE INDEX `account_movements_occurred_idx` ON `accountMovements` (`occurredAt`);