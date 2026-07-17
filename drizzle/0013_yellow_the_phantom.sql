CREATE INDEX `ops_event_server_at_idx` ON `ops` (`eventId`,`serverAt`);--> statement-breakpoint
CREATE INDEX `ops_operator_idx` ON `ops` (`operatorId`);