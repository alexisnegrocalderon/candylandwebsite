ALTER TABLE `lockerItems` MODIFY `status` enum('pendiente','guardado','parcial','retirado','anulado') NOT NULL DEFAULT 'pendiente';--> statement-breakpoint
ALTER TABLE `lockerItems` ADD `partialNote` varchar(255);
