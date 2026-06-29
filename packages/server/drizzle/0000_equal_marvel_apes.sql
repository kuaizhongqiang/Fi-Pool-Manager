CREATE TABLE `analysis_roler` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`role` text NOT NULL,
	`responsibility` text DEFAULT '' NOT NULL,
	`report` text DEFAULT '' NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_analysis_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`indicators` text DEFAULT '{}' NOT NULL,
	`signals` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_info` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `final_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`full_report` text DEFAULT '' NOT NULL,
	`role_summary` text DEFAULT '[]' NOT NULL,
	`pipeline_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pool` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`desc` text DEFAULT '' NOT NULL,
	`pool_analysis` text DEFAULT '' NOT NULL,
	`pool_signal` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pool_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pool_id` integer NOT NULL,
	`stock_code` text NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`pool_id`) REFERENCES `pool`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stock_code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sentiment_report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`date` text NOT NULL,
	`report` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `stock`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`current_price` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vec_embedding` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_type` text NOT NULL,
	`content_code` text NOT NULL,
	`content_date` text NOT NULL,
	`content_text` text NOT NULL,
	`embedding` blob,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ar_code_date` ON `analysis_roler` (`code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_ar_role` ON `analysis_roler` (`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dar_unique` ON `daily_analysis_report` (`code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_dar_code` ON `daily_analysis_report` (`code`);--> statement-breakpoint
CREATE INDEX `idx_dar_date` ON `daily_analysis_report` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_info_unique` ON `daily_info` (`code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_daily_info_code` ON `daily_info` (`code`);--> statement-breakpoint
CREATE INDEX `idx_daily_info_date` ON `daily_info` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_fr_unique` ON `final_report` (`code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_fr_code` ON `final_report` (`code`);--> statement-breakpoint
CREATE INDEX `idx_fr_date` ON `final_report` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `pool_name_unique` ON `pool` (`name`);--> statement-breakpoint
CREATE INDEX `idx_pool_name` ON `pool` (`name`);--> statement-breakpoint
CREATE INDEX `idx_pool_signal` ON `pool` (`pool_signal`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pool_stock_unique` ON `pool_stock` (`pool_id`,`stock_code`);--> statement-breakpoint
CREATE INDEX `idx_pool_stock_pool` ON `pool_stock` (`pool_id`);--> statement-breakpoint
CREATE INDEX `idx_pool_stock_stock` ON `pool_stock` (`stock_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sr_unique` ON `sentiment_report` (`code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_sr_code` ON `sentiment_report` (`code`);--> statement-breakpoint
CREATE INDEX `idx_sr_date` ON `sentiment_report` (`date`);--> statement-breakpoint
CREATE INDEX `idx_stock_name` ON `stock` (`name`);--> statement-breakpoint
CREATE INDEX `idx_ve_type` ON `vec_embedding` (`content_type`);--> statement-breakpoint
CREATE INDEX `idx_ve_code` ON `vec_embedding` (`content_code`);--> statement-breakpoint
CREATE INDEX `idx_ve_type_code_date` ON `vec_embedding` (`content_type`,`content_code`,`content_date`);