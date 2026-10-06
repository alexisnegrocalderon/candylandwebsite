ALTER TABLE `igKeywordAutomations` ADD `buttonKind` varchar(12) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `igKeywordAutomations` ADD `buttonTarget` varchar(300);--> statement-breakpoint
ALTER TABLE `igKeywordAutomations` ADD `buttonTitle` varchar(20);