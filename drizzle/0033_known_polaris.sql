CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('evento','general') NOT NULL,
	`eventId` int,
	`periodMonth` varchar(7) NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`category` enum('decoracion','barra','merch','staff','produccion','arriendo','marketing','transporte','suscripciones','comisiones','otros') NOT NULL,
	`description` varchar(255) NOT NULL,
	`supplier` varchar(160),
	`supplierRut` varchar(16),
	`documentType` enum('boleta','factura','boleta_honorarios','sin_documento') NOT NULL,
	`documentNumber` varchar(32),
	`ivaExempt` int NOT NULL DEFAULT 0,
	`amountTotal` decimal NOT NULL,
	`netAmount` decimal NOT NULL,
	`ivaAmount` decimal NOT NULL DEFAULT '0',
	`paymentMethod` enum('efectivo','tarjeta','transferencia','otro') NOT NULL,
	`paidFromShiftId` int,
	`recurrence` enum('none','mensual') NOT NULL DEFAULT 'none',
	`recurrenceEndsAt` timestamp,
	`recurringParentId` int,
	`excludeFromPnl` int NOT NULL DEFAULT 0,
	`prorate` int NOT NULL DEFAULT 1,
	`receiptUrl` text,
	`notes` varchar(500),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_recurring_month_unique` UNIQUE(`recurringParentId`,`periodMonth`)
);
--> statement-breakpoint
ALTER TABLE `events` ADD `ivaApplies` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `expenses_event_idx` ON `expenses` (`eventId`);--> statement-breakpoint
CREATE INDEX `expenses_period_idx` ON `expenses` (`periodMonth`,`scope`);--> statement-breakpoint
CREATE INDEX `expenses_shift_idx` ON `expenses` (`paidFromShiftId`);