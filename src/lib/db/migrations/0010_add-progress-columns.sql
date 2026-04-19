CREATE TABLE `market_pulse_classifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`ticker` text NOT NULL,
	`candle_time` text NOT NULL,
	`candle_data` text NOT NULL,
	`indicators` text NOT NULL,
	`classification` text NOT NULL,
	`event_blurb` text NOT NULL,
	`significance` text NOT NULL,
	`tradability` text NOT NULL,
	`level` text DEFAULT 'candle' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_market_pulse_classifications_run` ON `market_pulse_classifications` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_market_pulse_classifications_ticker_time` ON `market_pulse_classifications` (`ticker`,`candle_time`);--> statement-breakpoint
CREATE TABLE `market_pulse_correlations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`ticker` text NOT NULL,
	`price_event` text NOT NULL,
	`candle_time` text NOT NULL,
	`external_event_type` text NOT NULL,
	`external_event_id` integer,
	`external_event_summary` text NOT NULL,
	`external_event_payload` text,
	`sentiment` text NOT NULL,
	`correlation_confidence` real NOT NULL,
	`reasoning` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_market_pulse_correlations_run` ON `market_pulse_correlations` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_market_pulse_correlations_ticker_created` ON `market_pulse_correlations` (`ticker`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_pulse_narratives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`ticker` text NOT NULL,
	`current_control` text NOT NULL,
	`control_strength` integer NOT NULL,
	`market_phase` text NOT NULL,
	`expected_behavior` text NOT NULL,
	`narrative_summary` text NOT NULL,
	`key_conflicts` text,
	`confidence_in_assessment` real,
	`structured_output` text,
	`input_event_count` integer NOT NULL,
	`prior_run_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_pulse_narratives_run_ticker` ON `market_pulse_narratives` (`run_id`,`ticker`);--> statement-breakpoint
CREATE INDEX `idx_market_pulse_narratives_ticker_created` ON `market_pulse_narratives` (`ticker`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_pulse_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`ticker` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`candle_window` text NOT NULL,
	`llm_tokens_used` integer,
	`duration_ms` integer,
	`stages` text,
	`current_stage` text,
	`progress_pct` integer DEFAULT 0,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_pulse_runs_run_id` ON `market_pulse_runs` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_market_pulse_runs_ticker_created` ON `market_pulse_runs` (`ticker`,`created_at`);--> statement-breakpoint
CREATE TABLE `market_pulse_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`added_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_market_pulse_subscriptions_ticker` ON `market_pulse_subscriptions` (`ticker`);--> statement-breakpoint
CREATE INDEX `idx_market_pulse_subscriptions_active_added` ON `market_pulse_subscriptions` (`is_active`,`added_at`);