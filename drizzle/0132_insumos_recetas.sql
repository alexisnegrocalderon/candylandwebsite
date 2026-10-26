CREATE TABLE `insumos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`unit` enum('ml','g','un') NOT NULL DEFAULT 'ml',
	`containerSize` int NOT NULL DEFAULT 750,
	`containerLabel` varchar(30) NOT NULL DEFAULT 'botella',
	`costPerContainer` decimal(10,0),
	`alertDrinks` int NOT NULL DEFAULT 15,
	`active` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insumos_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE `insumoRecetas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketTypeId` int NOT NULL,
	`insumoId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	CONSTRAINT `insumoRecetas_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `insumo_recetas_tt_insumo_idx` ON `insumoRecetas` (`ticketTypeId`,`insumoId`);--> statement-breakpoint
CREATE INDEX `insumo_recetas_insumo_idx` ON `insumoRecetas` (`insumoId`);--> statement-breakpoint
CREATE TABLE `insumoMovimientos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insumoId` int NOT NULL,
	`eventId` int,
	`kind` enum('carga','compra','venta','anulacion','conteo_ajuste','merma','ajuste') NOT NULL,
	`delta` decimal(12,2) NOT NULL,
	`opId` varchar(64),
	`conteoId` int,
	`operatorId` int,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `insumoMovimientos_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `insumo_mov_op_idx` ON `insumoMovimientos` (`opId`,`insumoId`,`kind`);--> statement-breakpoint
CREATE INDEX `insumo_mov_insumo_idx` ON `insumoMovimientos` (`insumoId`);--> statement-breakpoint
CREATE INDEX `insumo_mov_event_idx` ON `insumoMovimientos` (`eventId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `insumoConteos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` int NOT NULL,
	`registerId` int,
	`shiftId` int,
	`kind` enum('apertura','cierre') NOT NULL,
	`operatorId` int,
	`operatorName` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `insumoConteos_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `insumo_conteos_event_idx` ON `insumoConteos` (`eventId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `insumoConteoLineas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conteoId` int NOT NULL,
	`insumoId` int NOT NULL,
	`closedContainers` int NOT NULL DEFAULT 0,
	`openFraction` decimal(4,2) NOT NULL DEFAULT '0',
	`countedTotal` decimal(12,2) NOT NULL,
	`expectedTotal` decimal(12,2) NOT NULL,
	CONSTRAINT `insumoConteoLineas_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `insumo_conteo_lineas_conteo_idx` ON `insumoConteoLineas` (`conteoId`);
