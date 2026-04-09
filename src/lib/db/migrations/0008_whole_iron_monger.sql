CREATE TABLE `pipeline_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`stages` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_pipeline_runs_completed` ON `pipeline_runs` (`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_pipeline_runs_status` ON `pipeline_runs` (`status`);--> statement-breakpoint
CREATE TABLE `short_interest` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`shares_short` real,
	`short_ratio` real,
	`short_percent_of_float` real,
	`squeeze_pressure` text NOT NULL,
	`date_short_interest` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_short_interest_ticker` ON `short_interest` (`ticker`);--> statement-breakpoint
DROP TABLE `sim_evaluations`;--> statement-breakpoint
DROP TABLE `sim_portfolio`;--> statement-breakpoint
DROP TABLE `sim_portfolio_snapshots`;--> statement-breakpoint
DROP TABLE `sim_trades`;--> statement-breakpoint
ALTER TABLE `analyses` ADD `source` text;--> statement-breakpoint
CREATE INDEX `idx_analyses_source_created` ON `analyses` (`source`,`created_at`);