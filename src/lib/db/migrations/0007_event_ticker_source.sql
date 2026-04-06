ALTER TABLE `analyses` ADD `source` text;--> statement-breakpoint
CREATE INDEX `idx_analyses_source_created` ON `analyses` (`source`,`created_at`);