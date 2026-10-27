CREATE TABLE IF NOT EXISTS `insumoAlias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insumoId` int NOT NULL,
	`alias` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `insumoAlias_id` PRIMARY KEY(`id`),
	UNIQUE KEY `insumo_alias_alias_idx` (`alias`)
);
