ALTER TABLE `insumoRecetas` ADD `glass` varchar(10) NOT NULL DEFAULT 'vaso';--> statement-breakpoint
DROP INDEX `insumo_recetas_tt_insumo_idx` ON `insumoRecetas`;--> statement-breakpoint
CREATE UNIQUE INDEX `insumo_recetas_tt_insumo_glass_idx` ON `insumoRecetas` (`ticketTypeId`,`insumoId`,`glass`);
