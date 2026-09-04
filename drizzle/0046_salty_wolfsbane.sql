ALTER TABLE `shifts` ADD `cashPaidOut` decimal;--> statement-breakpoint
ALTER TABLE `shifts` ADD `openKey` varchar(64) GENERATED ALWAYS AS ((case when `status` = 'open' then concat(`eventId`, '-', ifnull(`registerId`, 'x')) else null end)) VIRTUAL;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_open_unique` UNIQUE(`openKey`);