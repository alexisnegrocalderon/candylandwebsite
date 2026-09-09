CREATE TABLE `prepaidLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`delta` int NOT NULL,
	`reason` enum('topup_web','spend_caja','spend_puerta','refund','manual_adjust') NOT NULL,
	`orderId` int,
	`opId` varchar(36),
	`balanceAfter` int NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prepaidLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `prepaid_ledger_op_reason_unique` UNIQUE(`opId`,`reason`),
	CONSTRAINT `prepaid_ledger_order_reason_unique` UNIQUE(`orderId`,`reason`)
);
--> statement-breakpoint
ALTER TABLE `ops` MODIFY COLUMN `type` enum('redeem','checkin','sale','void_code','note','shift_open','shift_close','manual_adjust','locker_return','kitchen_update','parking_paid') NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `prepaidBalance` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `cardPinHash` varchar(255);--> statement-breakpoint
ALTER TABLE `customers` ADD `cardPinSetAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `customerId` int;--> statement-breakpoint
ALTER TABLE `ticketTypes` ADD `topupAmount` int;--> statement-breakpoint
ALTER TABLE `tickets` ADD `carriedFromEventId` int;--> statement-breakpoint
CREATE INDEX `prepaid_ledger_customer_idx` ON `prepaidLedger` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_event_idx` ON `orders` (`eventId`);--> statement-breakpoint
CREATE INDEX `orders_buyer_email_idx` ON `orders` (`buyerEmail`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `playcoins_ledger_customer_idx` ON `playcoinsLedger` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `playcoins_ledger_order_idx` ON `playcoinsLedger` (`orderId`);--> statement-breakpoint
CREATE INDEX `playcoins_ledger_op_idx` ON `playcoinsLedger` (`opId`);--> statement-breakpoint
CREATE INDEX `tickets_order_status_idx` ON `tickets` (`orderId`,`status`);--> statement-breakpoint
-- Backfill de orders.customerId: hasta acá la identidad del comprador se unía
-- por string de email en cada consulta. customers.email ya se guarda siempre
-- normalizado (upsertCustomerFromOrder hace trim().toLowerCase()), pero
-- orders.buyerEmail conserva lo que tecleó la persona, así que el match
-- normaliza el lado de orders. Se excluyen los dos emails placeholder
-- (invitaciones del admin y ventas de caja sin email capturado): no
-- representan a una persona, y enlazarlos colgaría órdenes de gente distinta
-- de una misma identidad falsa.
UPDATE `orders` o
  JOIN `customers` c ON c.email = LOWER(TRIM(o.buyerEmail))
  SET o.customerId = c.id
  WHERE o.customerId IS NULL
    AND LOWER(TRIM(o.buyerEmail)) NOT IN ('invitacion@mansionplayroom.cl', 'caja@mansionplayroom.cl');
