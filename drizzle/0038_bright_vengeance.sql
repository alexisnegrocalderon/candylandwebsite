ALTER TABLE `lockerItems` MODIFY COLUMN `status` enum('pendiente','guardado','retirado') NOT NULL DEFAULT 'pendiente';--> statement-breakpoint
ALTER TABLE `operators` MODIFY COLUMN `role` enum('admin','supervisor','caja','barra','acceso','cocina','guardarropia') NOT NULL;--> statement-breakpoint
ALTER TABLE `lockerItems` ADD `receivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lockerItems` ADD `receivedByOperatorId` int;