# posthog-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps the [PostHog](https://posthog.com) REST API, letting AI agents query your analytics data directly via tool calls — no browser tab required.

Works with Claude Desktop, Cursor, and any other MCP-compatible client.

## What it does

Exposes five tools that cover the most common PostHog workflows:

| Tool | What it does |
|------|-------------|
| `get_insights` | Fetch a saved insight by ID (funnels, retention, trends) |
| `list_events` | Stream recent events, filterable by name, date range, or distinct ID |
| `get_feature_flags` | List all flags with rollout status and targeting rules |
| `query_trends` | Run an ad-hoc trends query and get a time series back |
| `get_persons` | Look up user profiles by distinct ID or search term |

## Prerequisites

- Node.js 18+
- A PostHog account with a personal API key ([Settings → Personal API Keys](https://app.posthog.com/settings/user-api-keys))
- Your project ID (visible in **Project Settings** or in the URL: `/project/<id>/`)

## Installation

```bash
git clone https://github.com/johnnikolo/posthog-mcp.git
cd posthog-mcp
npm install
cp .env.example .env   # then fill in your API key and project ID
npm run build
```

## Configuration

The server is configured via environment variables. When run locally, it automatically loads a `.env` file in the project root (via `dotenv`); when configured through an MCP client, use the client's `env` block instead (see below).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTHOG_API_KEY` | Yes | — | Your PostHog personal API key |
| `POSTHOG_PROJECT_ID` | Yes | — | The numeric project ID to query |
| `POSTHOG_HOST` | No | `https://app.posthog.com` | Override for self-hosted PostHog instances |

## Wiring it up in Claude Desktop

Add this to your `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "posthog": {
      "command": "node",
      "args": ["/absolute/path/to/posthog-mcp/dist/index.js"],
      "env": {
        "POSTHOG_API_KEY": "phx_your_key_here",
        "POSTHOG_PROJECT_ID": "12345"
      }
    }
  }
}
```

Restart Claude Desktop and the PostHog tools will appear automatically.

## Tools reference

### `get_insights`

Retrieve a saved PostHog insight by its numeric ID.

```
What does insight 42 show?
→ calls get_insights({ insight_id: 42 })
```

**Parameters**
- `insight_id` (number, required) — the insight's ID
- `refresh` (boolean, default `false`) — force a fresh calculation

---

### `list_events`

Fetch recent events with optional filters.

```
Show me the last 50 user_signed_up events from the past week
→ calls list_events({ event: "user_signed_up", after: "2024-01-01T00:00:00Z", limit: 50 })
```

**Parameters**
- `event` (string) — filter to a specific event name
- `after` / `before` (ISO 8601 string) — date range
- `limit` (number, default `100`, max `500`)
- `distinct_id` (string) — filter to a single user

---

### `get_feature_flags`

List all feature flags with their rollout configuration.

```
Which feature flags are currently active?
→ calls get_feature_flags({ active_only: true })
```

**Parameters**
- `active_only` (boolean, default `false`) — return only enabled flags

---

### `query_trends`

Run a trends query and get back a time series.

```
How many $pageview and user_signed_up events happened per day over the last 30 days?
→ calls query_trends({ events: ["$pageview", "user_signed_up"], date_from: "-30d", interval: "day" })
```

**Parameters**
- `events` (string[], required) — event names to include
- `date_from` (string, default `"-7d"`) — start of range (relative or ISO 8601)
- `date_to` (string) — end of range (defaults to now)
- `interval` (`"hour" | "day" | "week" | "month"`, default `"day"`)
- `breakdown` (string) — property to break results down by (e.g. `"$browser"`)

---

### `get_persons`

Look up person profiles.

```
Find the user with distinct ID "user_abc123"
→ calls get_persons({ distinct_id: "user_abc123" })
```

**Parameters**
- `distinct_id` (string) — look up a specific person
- `search` (string) — search by email, name, or property
- `limit` (number, default `20`, max `100`)

## Development

```bash
# run directly without building
npm run dev

# type-check only
npm run typecheck
```

## License

MIT
