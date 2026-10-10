ALTER TABLE `ambassadorBenefitDeliveries` DROP INDEX `ambassadorBenefitDeliveries_unique`;--> statement-breakpoint
ALTER TABLE `ambassadorBenefitDeliveries` ADD `eventId` int;--> statement-breakpoint
ALTER TABLE `ambassadorBenefitDeliveries` ADD CONSTRAINT `ambassadorBenefitDeliveries_event_unique` UNIQUE(`ambassadorId`,`eventId`,`benefitKey`);