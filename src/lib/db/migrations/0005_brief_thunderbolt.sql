CREATE TABLE `sim_evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`should_enter` integer NOT NULL,
	`reasoning` text,
	`strategy_name` text,
	`legs` text,
	`position_size` real,
	`net_premium` real,
	`confidence` real,
	`whale_quality_score` integer,
	`current_price` real,
	`portfolio_balance` real,
	`source_analysis_id` integer,
	`rejection_gate` text,
	`rejection_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_sim_evaluations_ticker` ON `sim_evaluations` (`ticker`);--> statement-breakpoint
CREATE INDEX `idx_sim_evaluations_should_enter` ON `sim_evaluations` (`should_enter`);