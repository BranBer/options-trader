CREATE TABLE `sim_portfolio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`balance` real DEFAULT 2000 NOT NULL,
	`starting_balance` real DEFAULT 2000 NOT NULL,
	`total_pnl` real DEFAULT 0 NOT NULL,
	`total_trades` integer DEFAULT 0 NOT NULL,
	`winning_trades` integer DEFAULT 0 NOT NULL,
	`losing_trades` integer DEFAULT 0 NOT NULL,
	`max_drawdown` real DEFAULT 0 NOT NULL,
	`best_trade_pnl` real DEFAULT 0 NOT NULL,
	`worst_trade_pnl` real DEFAULT 0 NOT NULL,
	`last_updated` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `sim_portfolio_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`balance` real NOT NULL,
	`total_pnl` real NOT NULL,
	`open_positions` integer DEFAULT 0 NOT NULL,
	`snapshot_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `sim_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`option_symbol` text,
	`strategy_name` text NOT NULL,
	`direction` text NOT NULL,
	`legs` text NOT NULL,
	`entry_price` real NOT NULL,
	`entry_date` text NOT NULL,
	`exit_price` real,
	`exit_date` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`pnl` real,
	`pnl_pct` real,
	`status` text DEFAULT 'open' NOT NULL,
	`exit_reason` text,
	`gemini_reasoning` text,
	`profit_target_pct` real,
	`stop_loss_pct` real,
	`time_exit_days` integer,
	`source_analysis_id` integer,
	`source_whale_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE `analyses` ADD `confidence_breakdown` text;