CREATE TABLE `pipeline_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`date` text NOT NULL,
	`mode` text DEFAULT 'full' NOT NULL,
	`pool_ids` text DEFAULT '[]' NOT NULL,
	`total_stocks` integer DEFAULT 0 NOT NULL,
	`completed_stocks` integer DEFAULT 0 NOT NULL,
	`failed_stocks` integer DEFAULT 0 NOT NULL,
	`skipped_stocks` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`duration_seconds` real,
	`avg_stock_duration` real,
	`args` text DEFAULT '' NOT NULL,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`finished_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_run_run_id_unique` ON `pipeline_run` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_pr_date` ON `pipeline_run` (`date`);--> statement-breakpoint
CREATE INDEX `idx_pr_status` ON `pipeline_run` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pr_run_id` ON `pipeline_run` (`run_id`);