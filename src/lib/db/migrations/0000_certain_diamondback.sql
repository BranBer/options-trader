CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`input_refs` text,
	`output` text,
	`confidence` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `market_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`price` real,
	`volume` integer,
	`iv` real,
	`iv_rank` real,
	`day_change_pct` real,
	`captured_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `news_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`headline` text NOT NULL,
	`source` text,
	`url` text,
	`published_at` text,
	`country_code` text,
	`lat` real,
	`lng` real,
	`impact_score` integer,
	`sentiment` text,
	`sectors` text,
	`tickers` text,
	`event_type` text,
	`raw_summary` text,
	`gemini_analysis` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `whale_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`strike` real,
	`expiry` text,
	`call_put` text,
	`premium` real,
	`volume` integer,
	`open_interest` integer,
	`underlying_price` real,
	`sentiment` text,
	`source` text,
	`detected_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
