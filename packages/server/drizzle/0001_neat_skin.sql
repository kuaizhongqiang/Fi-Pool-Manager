CREATE TABLE `daily_summary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`anomaly_count` integer DEFAULT 0 NOT NULL,
	`total_stocks` integer DEFAULT 0 NOT NULL,
	`full_report` text DEFAULT '' NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`pipeline_ids` text DEFAULT '[]' NOT NULL,
	`model_used` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT 'datetime('now')' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_summary_detail` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stock_code` text NOT NULL,
	`date` text NOT NULL,
	`dimension` text NOT NULL,
	`anomaly_desc` text DEFAULT '' NOT NULL,
	`anomaly_score` real DEFAULT 1 NOT NULL,
	`key_findings` text DEFAULT '' NOT NULL,
	`pipeline_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT 'datetime('now')' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `final_report` ADD `anomaly_score` real DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_summary_date_unique` ON `daily_summary` (`date`);--> statement-breakpoint
CREATE INDEX `idx_ds_date` ON `daily_summary` (`date`);--> statement-breakpoint
CREATE INDEX `idx_dsd_date` ON `daily_summary_detail` (`date`);--> statement-breakpoint
CREATE INDEX `idx_dsd_stock_date` ON `daily_summary_detail` (`stock_code`,`date`);--> statement-breakpoint
CREATE INDEX `idx_dsd_dimension` ON `daily_summary_detail` (`dimension`);