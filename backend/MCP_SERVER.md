# Pulsecraft Internal MCP Server

This MCP server exposes project-internal analytics functions (average speed, duration, events, gear analytics, scorecards, and full ride analysis) so an LLM/agent can call them directly.

## Location

- Server entrypoint: `app/mcp_server.py`

## Install

From `pulsecraft-bike/backend`:

```bash
pip install -r requirements.txt
```

## Run (stdio transport)

From `pulsecraft-bike/backend`:

```bash
python -m app.mcp_server
```

## Security configuration (Phase 2)

The server now supports token auth, per-tool authorization scopes, and audit logging.

### Environment variables

- `MCP_AUTH_REQUIRED` (default: `true`)
- `MCP_AUTH_TOKENS_JSON` (JSON token store)
- `MCP_AUTH_TOKEN` (single fallback admin token)
- `MCP_AUTH_SUBJECT` (subject for fallback single token)
- `MCP_AUDIT_LOG_PATH` (default: `./mcp_audit.log`)

Example token store:

```json
{
	"dev-read-token": {
		"subject": "dev-reader",
		"scopes": ["tools:read", "ride:read", "analysis:read"]
	},
	"dev-exec-token": {
		"subject": "dev-analyst",
		"scopes": ["tools:read", "ride:read", "analysis:read", "analysis:execute"]
	}
}
```

### Scope model

- `tools:read` → tool discovery
- `ride:read` → list recent rides
- `analysis:read` → read analytics outputs
- `analysis:execute` → run full/think analysis tools

## Tools exposed

- `list_internal_tools`
- `list_recent_rides`
- `get_average_speed`
- `get_duration_seconds`
- `get_events`
- `get_gear_analytics`
- `get_scorecards`
- `run_full_analysis_for_ride`
- `run_full_analysis_for_frames`
- `thinking_query_for_ride`
- `get_powerband_report`
- `get_shift_quality_report`
- `get_throttle_discipline_report`
- `get_braking_transition_report`
- `get_track_professional_insights`
- `get_llm_insight_pack`

## Thinking tool

`thinking_query_for_ride(ride_id, query)` now uses a two-step planner/executor:

1. **Intent classification** (maps query to intent buckets + confidence)
2. **Tool graph planning** (builds dependency graph and requested outputs)

It returns:

- selected tool pathway
- answer payload
- function lineage (where the answer came from)
- planner details (`step_1_intent_classification`, `step_2_tool_graph`)
- execution trace and confidence score

## Professional insight layer

The server now includes racecraft-focused helper tools built to improve LLM answer quality with deterministic signals:

- `get_powerband_report` → under-band / in-band / over-rev usage + efficiency score
- `get_shift_quality_report` → upshift/downshift quality, late upshifts, aggressive downshifts
- `get_throttle_discipline_report` → maintenance-throttle behavior, abrupt changes, commitment profile
- `get_braking_transition_report` → brake-to-throttle hesitation windows + transition score
- `get_track_professional_insights` → prioritized track-coach focus areas and drills
- `get_llm_insight_pack` → compact LLM-ready bundle of metrics, racecraft summaries, segments, events, and coaching

`thinking_query_for_ride` can now route to these outputs based on racecraft/professional/strategy intents.

## Smoke test

From `pulsecraft-bike/backend`:

```bash
python -m scripts.mcp_smoke_test
```

This validates:

- token authentication
- per-tool scope authorization
- audit log creation and entries

## Notes

- This server reads existing ride telemetry from the same backend database via SQLAlchemy.
- The analytics pipeline reuses existing functions from `app/analytics/*` and `app/routers/rides.py`.
- For production hardening, add authentication and tool-level authorization before exposing beyond trusted local environments.
