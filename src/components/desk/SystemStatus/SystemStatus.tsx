import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/formatters";
import type { SystemStatusProps } from "./types";

const LLM_PRIMARY_LABEL: Record<SystemStatusProps["system"]["llmPrimary"], string> = {
  claude: "Claude via Max subscription",
  openrouter: "OpenRouter",
};

export function SystemStatus({ system }: SystemStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>LLM primary: {LLM_PRIMARY_LABEL[system.llmPrimary]}</p>
        <p>Claude model: {system.claudeModel}</p>
        <p>
          Cooldown:{" "}
          {system.claudeCooldownUntil
            ? `until ${formatDateTime(system.claudeCooldownUntil)}`
            : "none"}
        </p>
        {system.lastClaudeError && (
          <p className="text-destructive">
            Last Claude error: {system.lastClaudeError}
          </p>
        )}
        <p>Jev configured: {system.jevConfigured ? "yes" : "no"}</p>
        <p>
          Unusual Whales configured: {system.unusualWhalesConfigured ? "yes" : "no"}
        </p>
        {!system.unusualWhalesConfigured && (
          <p className="text-xs text-muted-foreground">
            Add UNUSUAL_WHALES_API_KEY to .env.local and remove WHALE_SOURCE=polygon
          </p>
        )}
      </CardContent>
    </Card>
  );
}
