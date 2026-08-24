# Shared Agent Progress + Full Handoff

Last updated: 2026-02-25
Owner scope: Major Project workspace

## Purpose
This file is the handoff source-of-truth for cross-agent continuity. It summarizes what was implemented across frontend, backend analytics, and MCP orchestration, what was verified, and what remains.

## Mandatory logging protocol (effective now)
- Every code change must be followed by a SHARED_AGENT_PROGRESS update in the same work session.
- Append to Progress log for each completed feature/fix (do not replace prior history).
- Include impacted files and a one-line validation note if tested.
- If change is partial, mark as in-progress and list exact pending items.

---

## 1) High-level status

### Completed
- Ride details experience was consolidated into a tabbed shell with Analysis + Time Series AI in one page.
- Analysis pipeline/UI now supports scorecards, segment analytics, coaching insights, map focus from events, and raw data inspection.
- Time Series AI panel includes chart brush windowing, sessionized chat history, pinned context points, and map-chart coupling.
- Internal MCP server was built with analytics tools, auth tokens, per-tool scope checks, audit logging, smoke tests, and two-step planner routing.

### Current quality state
- Core edited files are passing editor diagnostics from recent runs.
- MCP smoke tests passed.
- Two-step planner path was run against real ride data and returned structured planner output + confidence.

### Known remaining work
- Optional hardening: per-token rate limiting / quotas in MCP.
- Optional planner quality: ambiguity-aware intent confidence.
- Existing unrelated frontend issues may still exist in legacy pages not in active flow.

---

## 2) What changed by area

## A. Ride analytics UI and map-focus reliability

### Primary goal solved
Event clicks in Analysis timeline now map to the correct location instead of repeatedly focusing near the start point.

### Implemented approach
- Added robust timestamp normalization to handle multiple timestamp formats (epoch seconds, epoch ms, elapsed seconds/ms, ISO strings).
- Added coordinate normalization and candidate filtering.
- Added nearest-point matching with progressive fallback:
	1) direct event timestamp mapping,
	2) normalized event-span to telemetry-span projection,
	3) speed-based nearest fallback,
	4) first valid telemetry point fallback.

### User-facing result
- Clicking events now reliably pans/highlights near the intended telemetry region.

## B. Time Series AI graph and telemetry columns

### Final requested chart composition
- Kept only: Speed, Gear, RPM
- Removed Lean and Throttle from final line set (per user request)
- Ordering preserved in legend/draw order as requested

### Additional UX work in same area
- Brush-selected range shading
- Improved tooltips and axes readability
- Point pinning on chart and map sync
- Hover marker on map for active chart point
- Sessionized chat (new/rename/delete behavior)

## C. Backend analysis contract and frontend widgets

### Contract/UI additions integrated
- Scorecards
- Segment analytics
- Coaching summary
- Analysis widgets to render those fields:
	- KPI tiles
	- Segment leaderboard
	- Coaching panel

## D. Internal MCP server + thinking model

### Built capabilities
- Internal analytics MCP tool surface (rides list, summary stats, event access, scorecards/gear, full-analysis helper).
- Auth mode via token map from env.
- Per-tool authorization via scopes.
- Audit logging of access and outcomes.
- Smoke test script for allow/deny/audit checks.

### Thinking model upgrade
- Replaced keyword-only routing with two-step planner:
	1) intent classification,
	2) tool graph planning/execution trace.
- Returns selected tools, planner structure, and confidence payload.

### Runtime bug fixed during validation
- Duplicate telemetry columns caused pandas ambiguity in normalization path.
- Fix: dedupe dataframe columns in preprocessing before downstream operations.

## E. UI Overhaul & Custom LLM Keys

### UI/UX Refinements
- Redesigned `DashboardPage` overview hero section with a premium dark-mode, glassmorphic aesthetic. Added glowing hover effects to KPI cards and animated progress bars.
- Completely redesigned `SettingsPage` with a smooth segmented control for tabs, true backdrop-filter glassmorphism, glowing inputs with custom focus rings, and richer gradient buttons.
- Replaced native `<select>` dropdowns with a newly created `CustomSelect` component (dark mode, glassmorphic, custom scrollbar) across `SettingsPage`, `TimeSeriesChatPage`, and `RidePage`.

### Custom LLM API Keys & Dynamic Models
- Added a list of new providers (OpenAI, Anthropic, DeepSeek, Mistral, xAI) to the backend registry `_load_llm_provider_registry` in `rides.py`.
- **Dynamic Model Fetching**: The `api/v1/rides/llm/providers` route now uses a global `_MODEL_CACHE` and a helper `_get_dynamic_models`. This connects to `client.models.list()` for Gemini and `{base_url}/models` for OpenAI compatibles, automatically populating dropdown lists with real-time models.
- Added an optional `api_key` payload to the backend `ChatRequest` schema, which routes to `_resolve_selected_provider` and is instantiated at request time.
- Added a custom API Key password input field in the local `SettingsPage`.
- Updated both `TimeSeriesChatPage` and `RidePage` chat modules to pluck `ts_llm_api_key` from local storage and pass it through to `ridesApi.chatWithTelemetry`.

---

## 3) File map (major touched files)

## Frontend (raptor-frontend)
- src/pages/RidePage.tsx
	- Unified ride shell, Analysis/Time Series tabs, event->map focus logic, timestamp normalization, chart/map interactions, pinned-point context.
- src/components/analytics/EventTimeline.tsx
	- Richer timeline display and click selection affordance.
- src/components/Map/AnalysisMap.tsx
- src/components/Map/LeafletAnalysisMap.tsx
	- Focus-point support and map fit/fly improvements.
- src/components/analytics/SegmentLeaderboard.tsx
- src/components/analytics/CoachingPanel.tsx
- src/components/analytics/GearUsageChart.tsx
	- Phase-1 analytics UI components.
- src/hooks/useChatSessions.ts
	- Time-series chat session persistence and lifecycle.
- src/services/api.ts
	- Expanded API contracts and ride/bike/auth client surface.

## Backend (pulsecraft-bike/backend)
- app/mcp_server.py
	- MCP server tools, token auth, scope checks, audit logging, two-step planner, duplicate-column dataframe fix.
- scripts/mcp_smoke_test.py
	- Auth/scope/audit smoke coverage.
- MCP_SERVER.md
	- Operational docs, env setup, planner explanation, smoke test usage.
- requirements.txt
	- MCP dependency additions.

## Project docs/tracking
- rider_analytics_mvp_checklist.md
	- Implementation phasing and rollout checklist.
- SHARED_AGENT_PROGRESS.md
	- This comprehensive handoff.

---

## 4) Verification evidence already run

### MCP verification
- Security smoke script executed successfully from backend folder.
- Direct planner execution run with token-protected environment against live ride data.
- Observed successful output including:
	- selected_tools
	- planner.step_1_intent_classification
	- planner.step_2_tool_graph
	- confidence payload

### Editor diagnostics
- Recent diagnostics for touched MCP/server docs-targeted files returned no new errors.
- Ride page/chart/map iterations were repeatedly checked during fixes.

---

## 5) Operational runbook (for next agent)

## Backend + MCP
1. Activate environment and install backend requirements.
2. Set auth env vars for MCP (token JSON + auth-required flag).
3. Run smoke test in pulsecraft-bike/backend/scripts/mcp_smoke_test.py.
4. Execute a direct thinking_query_for_ride call (or MCP client call) to confirm planner output.

## Frontend validation
1. Start raptor-frontend dev server.
2. Open ride page and test:
	 - Event click -> map focus location.
	 - Time Series chart showing only Speed/Gear/RPM.
	 - Pin on chart and map synchronization.
	 - Brush range + chat session behavior.

---

## 6) Risks / caveats
- Telemetry schemas remain heterogeneous across uploads; normalization paths are robust but should remain defensive.
- Some legacy routes/components in raptor-frontend are not primary flow and may have stale typing.
- MCP authorization is token/scope based but currently without quotas; heavy internal use can be unrestricted per token.

---

## 7) Recommended next tasks
1. Add MCP rate limiting/quotas (per token + rolling window).
2. Improve planner ambiguity detection and confidence calibration.
3. Add map<->segment leaderboard hover/click sync as next UX phase.
4. Add explicit regression checks for timestamp-normalization edge cases.

---

## 8) Progress log (chronological, compact)
- 2026-02-23: Time Series map resizing and chart polish; pin support.
- 2026-02-23: MVP checklist + initial shared tracker.
- 2026-02-23: Analysis payload expansion + new frontend analytics widgets.
- 2026-02-24 to 2026-02-25: Event-to-map focus bug investigated and fixed with normalization/fallback strategy.
- 2026-02-25: Time Series series set finalized to Speed/Gear/RPM per user direction.
- 2026-02-25: MCP internal server implemented and hardened (auth/scopes/audit/smoke).
- 2026-02-25: Thinking model verified on real ride data; duplicate-column bug fixed.
- 2026-02-25: Two-step planner (intent classification + tool graph) implemented and documented.
- 2026-02-25: Extended telemetry chat API response metadata in pulsecraft-bike/backend/app/schemas.py and pulsecraft-bike/backend/app/routers/rides.py with tools_used + progress_updates for frontend progress rendering.
- 2026-02-25: Added Gemini/ChatGPT-style thinking timeline animation and friendly Tools used panel in raptor-frontend/src/pages/RidePage.tsx Time Series AI chat.
- 2026-02-25: Added matching thinking timeline + tools/progress panel in raptor-frontend/src/pages/ChatbotPage.tsx for dashboard chatbot consistency.
- 2026-02-25: Updated raptor-frontend/src/services/api.ts with typed TelemetryChatResponse metadata fields and chat client typing.
- 2026-02-25: Added collapsible trace sections (expand/collapse) for tools/progress in raptor-frontend/src/pages/RidePage.tsx and raptor-frontend/src/pages/ChatbotPage.tsx.
- 2026-02-25: Added per-step timestamps for live thinking stages and completed progress updates in both chat UIs to better mimic ChatGPT/Gemini-style status streaming.
- 2026-02-25: Fixed JSX regression in RidePage tools panel after collapse refactor; diagnostics clean for RidePage and ChatbotPage.
- 2026-02-25: Performance pass on Time Series AI page in raptor-frontend/src/pages/RidePage.tsx:
	- throttled chart hover state commits to reduce high-frequency re-renders,
	- memoized GPS filtering/slicing in TelemetryMap,
	- downsampled map polyline points for large telemetry routes,
	- enabled Leaflet canvas rendering (`preferCanvas`) and disabled line animations in Recharts.
	Validation: diagnostics clean for RidePage after optimization changes.
- 2026-02-25: Fixed typing lag in chatbot inputs by switching to uncontrolled/ref-based text inputs (no re-render on each keystroke) in:
	- raptor-frontend/src/pages/RidePage.tsx (Time Series AI chat input)
	- raptor-frontend/src/pages/ChatbotPage.tsx (dashboard chatbot input)
	Validation: diagnostics clean for both updated files.
- 2026-02-25: Added elapsed hover timestamp in Time Series graph tooltip (`+HH:MM:SS`) in raptor-frontend/src/pages/RidePage.tsx by computing per-point elapsed time from ride start and rendering it in tooltip labels.
- 2026-02-25: Improved chat timing + gear correctness in pulsecraft-bike/backend/app/routers/rides.py:
	- sorted telemetry slice chronologically before analysis,
	- added explicit elapsed_s and elapsed_hms context columns,
	- added gear_stable (rolling-median smoothed) to reduce transient gear glitches,
	- updated LLM prompt rules to reference elapsed fields and prioritize gear_stable over noisy calculated_gear.
	Validation: diagnostics clean for updated backend router file.
- 2026-02-25: Time references and navigation upgrades:
	- backend prompt now explicitly forbids raw ms timestamps in AI answers and enforces elapsed_hms format,
	- Time Series chat auto-links `+HH:MM:SS` tokens,
	- clicking a time token now jumps focus to the nearest telemetry point in graph + map (pins marker, updates hover, and recenters selected window if needed).
	Files: raptor-frontend/src/pages/RidePage.tsx, pulsecraft-bike/backend/app/routers/rides.py.
- 2026-02-25: Timestamp UX and click behavior cleanup:
	- normalized all clickable elapsed tokens to `+HH:MM:SS` display (fractional seconds stripped in UI),
	- intercepted `time:` markdown links in both Ride and TimeSeriesChat pages so clicks do in-page focus (no route/navigation redirect),
	- improved timestamp chip styling for readability,
	- updated Analysis CTA to open Ride page directly on Time Series tab (`/rides/:id?tab=timeseries`).
	Files: raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, raptor-frontend/src/pages/AnalysisPage.tsx.
- 2026-02-25: Root-cause redirect fix for timestamp clicks:
	- found runtime case where timestamp markdown links rendered as empty href anchors (`href=""`) so custom `time:` handler was skipped,
	- added resilient timestamp extraction in markdown link renderer (works from `href` or link text token),
	- fallback changed so empty href renders plain text for non-time links (prevents unintended navigation),
	- live browser validation: clicked 3 timestamp chips (`+00:00:02`, `+00:00:28`, `+00:01:47`) and URL remained `.../rides/1772005804219` while pinned point updated each click.
	Files: raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx.
- 2026-02-25: Speed-axis tick visibility fix in Time Series chart:
	- increased chart left margin and set explicit left Y-axis width/tick margin so speed values are not clipped off-screen,
	- resolved missing left-side speed measurement numbers in Ride page Time Series panel.
	Files: raptor-frontend/src/pages/RidePage.tsx.
- 2026-02-25: Follow-up axis visibility hardening:
	- diagnosed left speed ticks rendering at negative x (`-4`) and being clipped,
	- shifted left-axis tick labels inward (`dx: 26`) and boosted tick readability (larger, higher-contrast text),
	- verified in live DOM: left axis tick x positions moved to visible positive coordinates.
	Files: raptor-frontend/src/pages/RidePage.tsx.
- 2026-02-25: Backend LLM pro-insight function expansion for track-level coaching:
	- added racecraft analytics helpers in MCP server: powerband report, shift quality report, throttle discipline report, and braking-transition report,
	- added new MCP tools: `get_powerband_report`, `get_shift_quality_report`, `get_throttle_discipline_report`, `get_braking_transition_report`, `get_track_professional_insights`, and `get_llm_insight_pack`,
	- expanded `thinking_query_for_ride` intent routing + projection outputs to include professional racecraft insights and compact LLM insight packs,
	- updated MCP documentation for new tool surface and planner capability.
	Files: pulsecraft-bike/backend/app/mcp_server.py, pulsecraft-bike/backend/MCP_SERVER.md.
- 2026-02-25: Connected pro-insight pack to standard Time Series chat prompt path:
	- added racecraft insight computation in `/api/v1/rides/{ride_id}/chat` from the selected telemetry slice,
	- computed and injected professional insight JSON context (powerband, shift quality, throttle discipline, brake-throttle transitions, priorities, top segments) into Gemini prompt,
	- upgraded chat prompt policy to enforce race-engineer style and measurable, high-impact drill recommendations,
	- updated chat trace metadata (`tools_used` / `progress_updates`) to include the professional insight engine step.
	Files: pulsecraft-bike/backend/app/routers/rides.py.
- 2026-02-25: Rider-friendly wording cleanup for AI responses:
	- replaced raw developer-style insight JSON prompt context with a user-friendly racecraft summary block,
	- added explicit prompt constraint to never expose internal field names (e.g., snake_case metric keys),
	- preserved the same pro-insight signal quality while improving readability for riders.
	Files: pulsecraft-bike/backend/app/routers/rides.py.
- 2026-02-25: Added post-processing safety net for rider-facing AI language:
	- added response sanitizer that rewrites internal snake_case metrics to rider-friendly terms before returning chat responses,
	- included both explicit key mappings and a generic snake_case fallback rewrite,
	- keeps elapsed timing references readable while preventing developer-style field leakage in UI output.
	Files: pulsecraft-bike/backend/app/routers/rides.py.
- 2026-03-04: Added clean AI/LLM architecture diagram to docs:
	- added a Mermaid flowchart for the current Time Series AI request path (frontend -> FastAPI -> Gemini -> frontend),
	- documented preprocessing, pro insight pack generation, and rider-friendly post-processing stages,
	- included optional MCP two-step planner path and shared analytics-core relationship in the same diagram.
	Files: pulsecraft-bike/docs/02_system_architecture.md, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added simplified AI/LLM architecture diagram to main project README:
	- added a compact Mermaid flow from user query -> frontend -> backend preprocessing -> pro insight pack -> Gemini -> response sanitization -> UI rendering,
	- included analytics dependency and optional MCP planner linkage for quick high-level understanding in top-level docs,
	- validation: Mermaid syntax follows the same structure already render-validated in system architecture docs.
	Files: README.md, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added iterative reasoning layer to telemetry chat endpoint for higher-quality AI responses:
	- implemented multi-pass reasoning pipeline in backend chat flow: first-pass draft -> critic/refiner verification rounds -> corrected final answer,
	- added deterministic guard checks (raw epoch timestamp blocking, internal snake_case leakage detection, minimum answer quality threshold),
	- added environment-controlled behavior for reasoning (`TELEMETRY_REASONING_ENABLED`, `TELEMETRY_REASONING_MAX_ROUNDS`, optional `GEMINI_MODEL` override),
	- integrated safe fallbacks to single-pass generation if reasoning stage fails or returns empty output,
	- exposed reasoning activity through `tools_used` and `progress_updates` for frontend thinking timeline rendering.
	Validation: diagnostics clean for updated backend router file.
	Files: pulsecraft-bike/backend/app/routers/rides.py, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added configurable multi-LLM routing + frontend provider selection + quota notifications:
	- backend now supports provider-agnostic LLM routing with OpenAI-compatible request format and Gemini support,
	- added env-driven provider registry (`LLM_PROVIDERS_JSON`, `LLM_DEFAULT_PROVIDER`) and provider catalog API (`GET /api/v1/rides/llm/providers`),
	- chat payload extended with optional `llm_provider` and `llm_model` selectors,
	- implemented normalized upstream error mapping for quota/auth/provider failures with user-facing metadata (`code`, `user_message`, `retry_after_seconds`, `provider`, `model`),
	- frontend Time Series chat UIs now allow provider/model selection and display actionable notification banners for 429/quota errors,
	- updated API client to parse backend error details and surface friendly retry/switch guidance.
	Validation: diagnostics clean for updated backend + frontend files.
	Files: pulsecraft-bike/backend/app/routers/rides.py, pulsecraft-bike/backend/app/schemas.py, raptor-frontend/src/services/api.ts, raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, README.md, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added new Settings page with Profile, LLM Config, and Other sections:
	- created `SettingsPage` with in-page section tabs: Profile, LLM Config, and Other,
	- Profile section supports editing full name, avatar upload, and sign out actions,
	- LLM Config section consumes provider catalog API, lets users choose provider/model defaults, and persists defaults to localStorage (`ts_llm_provider`, `ts_llm_model`),
	- Other section includes backend API URL management (`api_url`), connection test, and apply actions,
	- wired app route (`/settings`) and dashboard navigation/top-bar access to Settings page while keeping existing Profile route intact.
	Validation: diagnostics clean for App, DashboardLayout, and SettingsPage.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, raptor-frontend/src/App.tsx, raptor-frontend/src/layouts/DashboardLayout.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Refined Settings layout to avoid a second sidebar visual:
	- replaced the vertical in-page section panel with a compact top tab row (Profile, LLM Config, Other),
	- kept only the global dashboard sidebar as the primary left navigation while preserving Settings section switching behavior.
	Validation: diagnostics clean for SettingsPage after layout update.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Updated Settings tab active visual style to match sidebar emphasis:
	- aligned active/hover styling with sidebar tone using red-accent background treatment,
	- added stronger active border + subtle red glow and bottom accent line for clearer selected-state feedback.
	Validation: diagnostics clean for SettingsPage style update.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Enhanced UI design quality across all Settings sections:
	- Profile section upgraded with richer hierarchy (section header/tag, identity surface, metadata surface, and clearer detail editing block),
	- LLM Config section upgraded with structured routing surface, metadata pills, and improved visual grouping for provider/model controls,
	- Other section upgraded with dedicated connection surface, active URL visibility, and clearer action grouping,
	- introduced reusable visual primitives in Settings page styles (`settings-surface`, section tags, title rows, meta pills) for more polished presentation.
	Validation: diagnostics clean for SettingsPage after UI enhancements.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Settings declutter + smooth section switching pass:
	- added lightweight tab-switch transition animation (subtle fade/slide) on section content cards,
	- reduced visual heaviness by softening nested borders/glows, tightening spacing rhythm, and simplifying surface backgrounds,
	- refined typography sizing and control padding for a cleaner, less clumsy settings layout while preserving all functionality.
	Validation: diagnostics clean for SettingsPage after transition and declutter updates.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Mobile usability polish for Settings page:
	- improved section tab behavior on smaller screens with horizontal scroll + snap alignment,
	- refined responsive spacing/padding for compact viewports,
	- stacked action buttons into full-width touch-friendly layout on narrow screens,
	- tuned mobile scrollbar visibility for tab strip discoverability.
	Validation: diagnostics clean for SettingsPage responsive updates.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Settings desktop layout rebalance to reduce clumsy clustering:
	- removed narrow max-width concentration so settings content now uses available dashboard width,
	- introduced responsive split panels (`settings-split`) in LLM and Other sections to distribute content across both sides,
	- added compact summary surfaces for provider/model and workspace defaults to avoid large empty regions,
	- added lightweight profile status summary pills for better visual balance and scanability.
	Validation: diagnostics clean for SettingsPage after layout rebalance.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Top-fold spacing micro-pass for cleaner Settings rhythm:
	- tightened header/subtitle/tabs/content spacing by ~8–12px to reduce visual looseness,
	- reduced top container and section gap values while preserving readability and hierarchy.
	Validation: diagnostics clean for SettingsPage after spacing adjustments.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Final Settings action-button consistency pass:
	- standardized action button dimensions, typography, and spacing across Profile, LLM Config, and Other sections,
	- aligned interaction behavior with consistent hover/focus feedback and refined primary/secondary/danger visual hierarchy,
	- ensured mobile full-width button behavior remains intact after consistency updates.
	Validation: diagnostics clean for SettingsPage button updates.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Upgraded Overview dashboard with a hero analytics section and all-rides insights:
	- redesigned Dashboard overview top-fold with a premium hero surface and compact KPI cards,
	- added global analytics computed from all rides (total rides, distance, time, peak speed, avg speed, 7-day activity, active bikes),
	- added contextual coverage snapshot for current bike vs total rides and latest ride timestamp,
	- preserved existing recent-session list interactions (open ride, delete ride, CSV import) and refreshed lists after delete.
	Validation: diagnostics clean for DashboardPage after hero/analytics update.
	Files: raptor-frontend/src/pages/DashboardPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Fixed DashboardPage JSX parser error after overview redesign:
	- resolved malformed nested ternary in the `recent-rides` render block (removed stray JSX expression wrapper),
	- restored valid React JSX parsing for Vite/Babel and preserved loading/empty/list rendering behavior.
	Validation: diagnostics clean for DashboardPage after parser fix.
	Files: raptor-frontend/src/pages/DashboardPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Implemented premium UI overhaul for Dashboard and Settings:
	- Introduced deep glassmorphism (`backdrop-filter`) and richer gradient backgrounds for Dashboard hero section.
	- Replaced basic Settings tabs with a pill-shaped segmented control style and glowing active state.
	- Designed premium input fields, dropdowns, and buttons with elevated focus rings and hover animations.
	- Refined typography sizing and spacing in both areas to look more high-end and luxurious.
	Files: raptor-frontend/src/pages/DashboardPage.tsx, raptor-frontend/src/pages/SettingsPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Elevated Dashboard Hero to "ultra-premium" aesthetic:
	- Added a slow, pulsing glowing radial background behind the hero container.
	- Upgraded title text with an elegant metallic gradient (`background-clip: text`).
	- Greatly enhanced KPI cards with deeper 3D lift (`translateY(-6px)`), distinct colored glowing shadows (`box-shadow`), and a scanning `shimmer` line gleam effect on hover.
	- Refined progress bar into an inset well with a fast-shimmering, neon-red fill.
	Files: raptor-frontend/src/pages/DashboardPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added MCP tool-calling orchestration to telemetry LLM chat:
	- implemented backend MCP tool planner in chat flow so the selected LLM can decide when tool calls are needed,
	- added guarded MCP tool execution pipeline with allowlisted tools (thinking planner, scorecards/events/insights, full analysis, recent rides),
	- integrated wrapper-first execution with auth-aware fallback to local MCP analytics computation to keep tool calls resilient,
	- injected compact MCP tool outputs into the final LLM prompt and surfaced execution trace in `tools_used` and `progress_updates`,
	- added env controls: `TELEMETRY_MCP_TOOL_CALLING_ENABLED`, `TELEMETRY_MCP_MAX_TOOL_CALLS`, `TELEMETRY_MCP_USE_TOOL_WRAPPERS`, optional `MCP_CHAT_AUTH_TOKEN`.
	Validation: diagnostics clean for updated rides router after MCP integration.
	Files: pulsecraft-bike/backend/app/routers/rides.py, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added per-message MCP activity indicator in telemetry chat UI:
	- extended chat message metadata model to carry message-level MCP activity state,
	- in Ride Time Series tab and standalone Time Series Chat page, assistant messages now show a subtle `MCP Active` badge when backend `tools_used` includes MCP traces,
	- detection is resilient to tool-name variants using case-insensitive MCP matching.
	Validation: diagnostics clean for RidePage, TimeSeriesChatPage, and useChatSessions.
	Files: raptor-frontend/src/hooks/useChatSessions.ts, raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added MCP badge hover details showing exact tool calls:
	- added message-level `mcpTools` metadata to persist the MCP tools associated with each assistant response,
	- wired MCP tool extraction from backend `tools_used` and attached it to each assistant message,
	- `MCP Active` badge now shows a tooltip listing the exact MCP tool names used for that message.
	Validation: diagnostics clean for RidePage, TimeSeriesChatPage, and useChatSessions.
	Files: raptor-frontend/src/hooks/useChatSessions.ts, raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Hardened telemetry chat against MCP auth noise + quota-heavy call patterns:
	- MCP wrapper execution now auto-bypasses to local MCP analytics when auth is required but token store is missing/invalid for chat context,
	- MCP LLM planner is now disabled by default (`TELEMETRY_MCP_LLM_PLANNER_ENABLED=false`) to avoid an extra upstream LLM call per request,
	- reasoning default rounds reduced from 2 to 1 to lower baseline request volume,
	- critique/refinement phase now gracefully skips refinement on 429 and returns the existing draft instead of failing the full request.
	Validation: diagnostics clean for updated rides router.
	Files: pulsecraft-bike/backend/app/routers/rides.py, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Added user-controlled Low-Quota Mode to disable reasoning per chat request:
	- added a `Low-Quota Mode` toggle in Settings → LLM Config with persistent local preference (`low_quota_mode`),
	- chat clients (Ride Time Series tab + standalone Time Series Chat page) now include `low_quota_mode` in telemetry chat payloads,
	- backend chat schema extended with `low_quota_mode` and chat endpoint now skips multi-pass reasoning when enabled,
	- kept provider/model defaults behavior intact while including low-quota status in saved LLM defaults flow.
	Validation: diagnostics clean for updated frontend and backend files.
	Files: raptor-frontend/src/pages/SettingsPage.tsx, raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, raptor-frontend/src/services/api.ts, pulsecraft-bike/backend/app/schemas.py, pulsecraft-bike/backend/app/routers/rides.py, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Fixed non-clickable AI time references when model outputs explicit markdown time links:
	- normalized explicit `time:+HH:MM:SS` links (including backticked variants) before markdown rendering,
	- prevented duplicate link-wrapping by protecting existing time-link markdown during enrichment,
	- restored reliable in-message timestamp chip click behavior for both Ride Time Series tab and standalone Time Series Chat page.
	Validation: diagnostics clean for RidePage and TimeSeriesChatPage.
	Files: raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Implemented production-grade conversation context management for telemetry chat:
	- extended chat request contracts to support `conversation_id` and structured `history` turns,
	- backend now normalizes/sanitizes history with bounded limits (max turns, per-message char cap, total char budget) before prompt construction,
	- backend prompt now includes prior-turn continuity context with explicit priority rule for latest user question + current telemetry slice,
	- frontend Ride Time Series and standalone Time Series chat clients now send recent session history and stable conversation IDs on each request.
	Validation: diagnostics clean for updated backend and frontend files.
	Files: pulsecraft-bike/backend/app/schemas.py, pulsecraft-bike/backend/app/routers/rides.py, raptor-frontend/src/services/api.ts, raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-04: Fixed non-clickable time references when model outputs implicit time without '+' prefix:
	- Updated `timeRegex` in both `RidePage.tsx` and `TimeSeriesChatPage.tsx` to make the `+` prefix optional (`\+?`).
	- Ensures standard `00:00:04` strings are successfully gathered and clickable in chat UI without relying on AI to strictly follow the prefix instruction.
	Validation: diagnostics clean for RidePage and TimeSeriesChatPage.
	Files: raptor-frontend/src/pages/RidePage.tsx, raptor-frontend/src/pages/TimeSeriesChatPage.tsx, SHARED_AGENT_PROGRESS.md.
- 2026-03-07: Enhancements to Ride Analysis Page:
	- Made the track map sticky while scrolling the Event Timeline.
	- Made the Event Timeline rows clickable to pinpoint exactly where they happened on the track map via a `focusedPoint` state linkage.
	Validation: Map remains in view upon scroll, and clicking an event updates the map marker in `AnalysisPage.tsx`.
	Files: raptor-frontend/src/pages/AnalysisPage.tsx.
- 2026-03-07: Fixed Event Timeline UI styling:
	- Updated the sticky header of the Event Timeline to use theme variables (`var(--bg-card)`, `var(--text-muted)`, `var(--border-color)`) instead of hardcoded RGBA values.
	- Removed the `backdropFilter` blur to eliminate transparency issues where content scrolled behind the header was visible in an unflattering way, matching the overall app aesthetic.
	- Removed the `Lat` and `Lng` columns and fixed the `zIndex` to prevent values from scrolling visibly above the header.
	Validation: Header background matches the card background and values properly scroll behind the header.
	Files: raptor-frontend/src/components/analytics/EventTimeline.tsx.
- 2026-03-08: Mobile App UI/UX and Ride Summary enhancements:
        - Updated Settings child pages to use a sleek scrollable inline title rather than a sticky frosted glass AppBar.
        - Converted the 'Manage Favorites' dialog in settings and 'Ride Options' menu in the trip detail screen to match the modern App glassmorphic UI.
        - Added map tracks to the ride summary page for each ride chip using lutter_map with dynamic coordinate loading.
        - Redesigned the Ride Summary cards (_RideCard) to a premium aesthetic featuring soft vignette gradients, glassmorphic pills, clean typography, and seamless map integration.
        - Added a grid/list tile view toggle in RideSummaryScreen allowing users to switch between the new large premium map tile view and a sleek compact list view.
        - Handled dependency tracking and fixed lutter_map deprecated parameters (isDotted) and strict polyline typing.
        Validation: Dart analyzer clean for 
ide_summary_screen.dart and UI visually validated.
        Files: pulsecraft-bike/mobile_app/pulsecraft_app/lib/features/settings/settings_screen.dart, pulsecraft-bike/mobile_app/pulsecraft_app/lib/features/ride_summary/trip_detail_screen.dart, pulsecraft-bike/mobile_app/pulsecraft_app/lib/features/ride_summary/ride_summary_screen.dart.
