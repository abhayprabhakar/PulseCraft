# Rider Analytics MVP - Implementation Checklist

This plan is tailored to the current codebase and focuses on adding high-impact rider coaching analytics in phases.

## Current integration points (already in project)

- Backend analysis endpoint: `raptor-bike/backend/app/routers/rides.py` (`GET /api/v1/rides/{ride_id}/analysis`)
- Existing analytics helpers:
	- `raptor-bike/backend/app/analytics/events.py`
	- `raptor-bike/backend/app/analytics/scoring.py`
	- `raptor-bike/backend/app/analytics/ml_models.py`
- Frontend analysis contract:
	- `raptor-frontend/src/services/api.ts` (`RideAnalysis`)
- Frontend analysis UI:
	- `raptor-frontend/src/pages/RidePage.tsx` (`AnalysisTab`)
	- `raptor-frontend/src/components/Map/AnalysisMap.tsx`
	- `raptor-frontend/src/components/analytics/EventTimeline.tsx`
	- `raptor-frontend/src/components/analytics/GearUsageChart.tsx`

---

## Phase 0 - Contract hardening (must do first)

### Backend
- [ ] Add typed response models in `raptor-bike/backend/app/schemas.py`:
	- [ ] `SegmentAnalytics`
	- [ ] `Scorecards`
	- [ ] `CoachingSummary`
	- [ ] `RideAnalysisResponse`
- [ ] Use `response_model=RideAnalysisResponse` on `GET /{ride_id}/analysis` in `raptor-bike/backend/app/routers/rides.py`.
- [ ] Ensure consistent timestamp handling inside analytics:
	- [ ] Normalize `timestamp` vs `timestamp_ms` before calling helpers.
	- [ ] Update `events.py` helpers to accept either schema safely.

### Frontend
- [ ] Expand `RideAnalysis` type in `raptor-frontend/src/services/api.ts` to match backend model.
- [ ] Keep old keys optional for backward compatibility during rollout.

### Done when
- [ ] Endpoint returns stable shape even with partial telemetry.
- [ ] No `undefined` rendering errors in `RidePage` analysis tab.

---

## Phase 1 - Core coaching MVP (highest value)

## 1) Add data fields to analysis payload

Add these fields in `raptor-bike/backend/app/routers/rides.py` response:

- [ ] `scorecards`
	- `smoothness_score`
	- `efficiency_score`
	- `consistency_score`
	- `risk_index`
	- `estimated_time_loss_s`
- [ ] `segment_analytics[]`
	- `segment_id`
	- `start_idx`, `end_idx`
	- `entry_speed_kph`, `apex_speed_kph`, `exit_speed_kph`
	- `braking_distance_m`, `peak_decel_mps2`
	- `throttle_delay_ms`, `throttle_jerk_score`
	- `time_delta_vs_best_s`
	- `risk_score_0_100`
	- `confidence_0_1`
	- `primary_issue` (`braking_late | midcorner_slow | poor_exit | unstable`)
- [ ] `coaching`
	- `strengths[]`
	- `weaknesses[]`
	- `drills[]`

## 2) Build frontend widgets in `AnalysisTab` (`raptor-frontend/src/pages/RidePage.tsx`)

- [ ] KPI row (replace current 4 cards with 5 coaching KPIs):
	- Smoothness
	- Efficiency
	- Consistency
	- Risk Index
	- Estimated Time Loss
- [ ] Add `SegmentLeaderboard` panel (top 5 worst segments by `time_delta_vs_best_s`).
- [ ] Add `CoachingPanel` panel (strengths/weaknesses/drills).

## 3) New components

Create:

- [ ] `raptor-frontend/src/components/analytics/SegmentLeaderboard.tsx`
- [ ] `raptor-frontend/src/components/analytics/CoachingPanel.tsx`

Use existing visual language from:

- `EventTimeline.tsx`
- `GearUsageChart.tsx`

### Done when
- [ ] Rider can identify top 3 problematic segments in <10 seconds.
- [ ] Coaching panel shows at least 2 concrete drills.

---

## Phase 2 - Map + segment intelligence

### Backend
- [ ] Add segment-level map metadata in analysis response:
	- `segment_id` on map segments
	- optional `time_loss_s` and `risk_score_0_100` per segment

### Frontend
- [ ] Extend `AnalysisMap` (`raptor-frontend/src/components/Map/AnalysisMap.tsx`) with mode toggle:
	- Speed mode (existing)
	- Time-loss mode
	- Risk mode
- [ ] Add click callback from map segment -> select row in `SegmentLeaderboard`.
- [ ] Add hover sync row <-> map segment highlight.

### Done when
- [ ] Clicking a bad segment on leaderboard highlights it on map.
- [ ] Map can visually answer “where am I losing time?”

---

## Phase 3 - Diagnostic depth (after MVP)

### Backend
- [ ] Add braking point repeatability metric per segment.
- [ ] Add post-apex throttle delay distributions.
- [ ] Add fatigue drift summary (first third vs last third).

### Frontend
- [ ] Add mini trend strips for consistency, risk, throttle smoothness.
- [ ] Add compare toggle: current ride vs rider best ride (same bike).

---

## Suggested rollout order (exact sequence)

1. [ ] Add backend response models in `schemas.py`.
2. [ ] Update `get_ride_analysis` payload construction in `routers/rides.py`.
3. [ ] Update frontend `RideAnalysis` type in `api.ts`.
4. [ ] Render new KPI cards in `RidePage.tsx`.
5. [ ] Add `SegmentLeaderboard` and `CoachingPanel` components.
6. [ ] Wire map/leaderboard sync in `AnalysisMap.tsx`.
7. [ ] Add tests/sanity checks for empty telemetry and sparse GPS.

---

## Data quality + fallback rules

- [ ] If no GPS: hide map mode toggles and show “No GPS data”.
- [ ] If no RPM/throttle: still compute basic speed/event analytics.
- [ ] If segment confidence < 0.4: show low-confidence badge and soften coaching text.
- [ ] Never fail entire response because one metric cannot be computed.

---

## Definition of done (MVP release)

- [ ] Analysis API returns `scorecards`, `segment_analytics`, `coaching`.
- [ ] Analysis tab shows KPIs + segment leaderboard + coaching panel.
- [ ] Rider can identify top issue and next drill within one screen.
- [ ] UI remains usable with missing fields (graceful degradation).

