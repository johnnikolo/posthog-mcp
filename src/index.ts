import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? "https://app.posthog.com";

if (!POSTHOG_API_KEY) {
  console.error("Error: POSTHOG_API_KEY environment variable is required");
  process.exit(1);
}
if (!POSTHOG_PROJECT_ID) {
  console.error("Error: POSTHOG_PROJECT_ID environment variable is required");
  process.exit(1);
}

async function posthogFetch(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${POSTHOG_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostHog API error ${res.status}: ${body}`);
  }

  return res.json();
}

const server = new McpServer({
  name: "posthog-mcp",
  version: "1.0.0",
});

// ── get_insights ──────────────────────────────────────────────────────────────
server.registerTool(
  "get_insights",
  {
    description:
      "Fetch a PostHog insight by ID and return its result data. Use this to retrieve saved insights like funnels, retention, or trend charts.",
    inputSchema: {
      insight_id: z.number().int().positive().describe("The numeric ID of the PostHog insight to retrieve"),
      refresh: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to force a fresh calculation instead of returning cached results"),
    },
  },
  async ({ insight_id, refresh }) => {
    const qs = refresh ? "?refresh=true" : "";
    const data = await posthogFetch(`/insights/${insight_id}/${qs}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── list_events ───────────────────────────────────────────────────────────────
server.registerTool(
  "list_events",
  {
    description:
      "Fetch recent events from a PostHog project. Supports filtering by event name and date range. Returns up to 100 events by default.",
    inputSchema: {
      event: z
        .string()
        .optional()
        .describe("Filter to a specific event name, e.g. '$pageview' or 'user_signed_up'"),
      after: z
        .string()
        .optional()
        .describe("ISO 8601 datetime — only return events after this timestamp, e.g. '2024-01-01T00:00:00Z'"),
      before: z
        .string()
        .optional()
        .describe("ISO 8601 datetime — only return events before this timestamp"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe("Maximum number of events to return (1–500, default 100)"),
      distinct_id: z
        .string()
        .optional()
        .describe("Filter events to a specific user's distinct ID"),
    },
  },
  async ({ event, after, before, limit, distinct_id }) => {
    const params = new URLSearchParams();
    if (event) params.set("event", event);
    if (after) params.set("after", after);
    if (before) params.set("before", before);
    if (limit) params.set("limit", String(limit));
    if (distinct_id) params.set("distinct_id", distinct_id);

    const data = await posthogFetch(`/events/?${params.toString()}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── get_feature_flags ─────────────────────────────────────────────────────────
server.registerTool(
  "get_feature_flags",
  {
    description:
      "List all feature flags in the project with their keys, enabled status, rollout percentages, and targeting conditions.",
    inputSchema: {
      active_only: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, return only active (enabled) feature flags"),
    },
  },
  async ({ active_only }) => {
    const params = new URLSearchParams();
    if (active_only) params.set("active", "true");

    const data = await posthogFetch(`/feature_flags/?${params.toString()}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── query_trends ──────────────────────────────────────────────────────────────
server.registerTool(
  "query_trends",
  {
    description:
      "Run a trends query to get event counts over time. Returns a time series of event occurrences, optionally broken down by a property.",
    inputSchema: {
      events: z
        .array(z.string())
        .min(1)
        .describe("List of event names to include in the trend query, e.g. ['$pageview', 'user_signed_up']"),
      date_from: z
        .string()
        .optional()
        .default("-7d")
        .describe("Start of the date range. Accepts relative values like '-7d', '-30d', or an ISO 8601 date"),
      date_to: z
        .string()
        .optional()
        .describe("End of the date range. Defaults to now if omitted"),
      interval: z
        .enum(["hour", "day", "week", "month"])
        .optional()
        .default("day")
        .describe("Granularity of the time series"),
      breakdown: z
        .string()
        .optional()
        .describe("Property to break results down by, e.g. '$browser' or 'plan'"),
    },
  },
  async ({ events, date_from, date_to, interval, breakdown }) => {
    const eventSeries = events.map((name) => ({ id: name, name, type: "events", order: 0 }));

    const query: Record<string, unknown> = {
      insight: "TRENDS",
      events: eventSeries,
      date_from,
      interval,
    };
    if (date_to) query.date_to = date_to;
    if (breakdown) {
      query.breakdown = breakdown;
      query.breakdown_type = "event";
    }

    const data = await posthogFetch(`/insights/trend/`, {
      method: "POST",
      body: JSON.stringify(query),
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── get_persons ───────────────────────────────────────────────────────────────
server.registerTool(
  "get_persons",
  {
    description:
      "Look up person profiles in PostHog. Can search by distinct ID or return a paginated list of persons with their properties.",
    inputSchema: {
      distinct_id: z
        .string()
        .optional()
        .describe("Look up a specific person by their distinct ID (e.g. user ID or anonymous ID)"),
      search: z
        .string()
        .optional()
        .describe("Search persons by email, name, or other identifying property"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe("Number of persons to return (1–100, default 20)"),
    },
  },
  async ({ distinct_id, search, limit }) => {
    const params = new URLSearchParams();
    if (distinct_id) params.set("distinct_id", distinct_id);
    if (search) params.set("search", search);
    if (limit) params.set("limit", String(limit));

    const data = await posthogFetch(`/persons/?${params.toString()}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── bootstrap ─────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PostHog MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
