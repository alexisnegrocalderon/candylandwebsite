CREATE TABLE `insumoReglas` (
	`insumoId` int NOT NULL,
	`grupo` varchar(20) NOT NULL DEFAULT 'bebida',
	`modo` varchar(20) NOT NULL DEFAULT 'receta',
	`cantidad` decimal(12,2) NOT NULL DEFAULT '0',
	`minimo` decimal(12,2) NOT NULL DEFAULT '0',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insumoReglas_insumoId` PRIMARY KEY(`insumoId`)
);
