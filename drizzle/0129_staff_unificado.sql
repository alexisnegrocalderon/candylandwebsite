ALTER TABLE `staffMembers` ADD `email` varchar(320);--> statement-breakpoint
ALTER TABLE `staffMembers` ADD `cargo` enum('caja','barra','puerta','cocina','guardarropia','supervisor','dj','rrpp','produccion','otro');--> statement-breakpoint
ALTER TABLE `staffMembers` ADD `pinHash` varchar(255);--> statement-breakpoint
ALTER TABLE `staffMembers` ADD `pinSetAt` timestamp NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `staff_members_email_idx` ON `staffMembers` (`email`);--> statement-breakpoint
ALTER TABLE `operators` ADD `staffId` int;--> statement-breakpoint
CREATE INDEX `operators_staff_idx` ON `operators` (`staffId`);
