from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request, Form, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session, object_session
from sqlalchemy import or_
from typing import List, Optional, Any, Dict, Callable
import pandas as pd
import numpy as np
import io
import re
import json
import gzip
import httpx
from datetime import datetime, timezone
import uuid
import secrets
from .. import database, models, auth
from ..models import Ride, User
from ..schemas import (
    RideCreate,
    RideSummary,
    RideDetail,
    ChatRequest,
    ChatResponse,
    RideUpdate,
    RideVisibilityUpdate,
    RideShareLinkCreate,
    RideShareLinkOut,
    RideAnalysisResponse,
    LlmProvidersResponse,
    LlmProviderOption,
)
import os
import time
from html import escape
from google import genai

_MODEL_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 300 # Cache models for 5 minutes

router = APIRouter(
    prefix="/api/v1/rides",
    tags=["rides"]
)

def _haversine_m(lat1, lng1, lat2, lng2):
    radius = 6371000.0
    lat1_rad, lng1_rad = np.radians(lat1), np.radians(lng1)
    lat2_rad, lng2_rad = np.radians(lat2), np.radians(lng2)
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlng / 2.0) ** 2
    return 2.0 * radius * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))

def _build_segment_analytics(df: pd.DataFrame):
    if df.empty or 'speed_kph' not in df.columns:
        return []

    working = df.copy()
    working['speed_kph'] = pd.to_numeric(working['speed_kph'], errors='coerce').fillna(0.0)

    if 'timestamp_ms' in working.columns:
        working['timestamp_ms'] = pd.to_numeric(working['timestamp_ms'], errors='coerce')
    elif 'timestamp' in working.columns:
        working['timestamp_ms'] = pd.to_datetime(working['timestamp'], errors='coerce').astype('int64') // 10**6
    else:
        working['timestamp_ms'] = np.arange(len(working)) * 1000

    throttle_col = None
    if 'throttle_percent' in working.columns:
        throttle_col = 'throttle_percent'
    elif 'throttle' in working.columns:
        throttle_col = 'throttle'

    if throttle_col is None:
        working['throttle_percent'] = 0.0
        throttle_col = 'throttle_percent'
    else:
        working[throttle_col] = pd.to_numeric(working[throttle_col], errors='coerce').fillna(0.0)

    if not working.empty:
        throttle_max = float(working[throttle_col].max())
        if throttle_max <= 1.5:
            working[throttle_col] = working[throttle_col] * 100.0
        working[throttle_col] = working[throttle_col].clip(lower=0.0, upper=100.0)

    working = working.reset_index(drop=True)
    from ..analytics.events import apply_kinematic_smoothing

    if "timestamp" not in working.columns and "timestamp_ms" in working.columns:
        working["timestamp"] = pd.to_datetime(working["timestamp_ms"], unit="ms")
    
    working = apply_kinematic_smoothing(working)
    if "filtered_accel_mps2" in working.columns:
        working["accel_mps2"] = working["filtered_accel_mps2"]
    else:
        working["accel_mps2"] = 0.0
    n = len(working)
    segment_count = min(12, max(4, n // 120))
    segment_size = max(20, n // segment_count)

    segments = []
    for index, start_idx in enumerate(range(0, n, segment_size)):
        end_idx = min(n - 1, start_idx + segment_size - 1)
        if end_idx <= start_idx:
            continue

        chunk = working.iloc[start_idx:end_idx + 1].copy()
        entry_speed = float(chunk['speed_kph'].iloc[0])
        apex_speed = float(chunk['speed_kph'].min())
        exit_speed = float(chunk['speed_kph'].iloc[-1])
        peak_decel = float(chunk['accel_mps2'].min()) if 'accel_mps2' in chunk.columns else 0.0

        braking_distance = 0.0
        if 'lat' in chunk.columns and 'lng' in chunk.columns:
            chunk['lat'] = pd.to_numeric(chunk['lat'], errors='coerce')
            chunk['lng'] = pd.to_numeric(chunk['lng'], errors='coerce')
            valid = chunk.dropna(subset=['lat', 'lng'])
            if len(valid) > 1:
                for point_idx in range(len(valid) - 1):
                    p1 = valid.iloc[point_idx]
                    p2 = valid.iloc[point_idx + 1]
                    if float(valid.iloc[point_idx + 1]['accel_mps2']) < -0.8:
                        braking_distance += _haversine_m(p1['lat'], p1['lng'], p2['lat'], p2['lng'])

        apex_local_idx = int(chunk['speed_kph'].idxmin())
        post_apex = working.iloc[apex_local_idx:end_idx + 1]
        throttle_delay_ms = 0
        speed_drop_kph = max(0.0, entry_speed - apex_speed)
        corner_like_segment = (peak_decel < -0.8) or (speed_drop_kph >= 8.0)

        if corner_like_segment and not post_apex.empty:
            apex_throttle = float(post_apex[throttle_col].iloc[0])
            throttle_trigger = float(np.clip(apex_throttle + 10.0, 15.0, 45.0))
            above_threshold = post_apex[post_apex[throttle_col] >= throttle_trigger]
            if not above_threshold.empty:
                raw_delay_ms = float(above_threshold.iloc[0]['timestamp_ms'] - working.iloc[apex_local_idx]['timestamp_ms'])
                chunk_duration_ms = float(max(200.0, chunk['timestamp_ms'].iloc[-1] - chunk['timestamp_ms'].iloc[0]))
                max_valid_delay_ms = float(min(4000.0, chunk_duration_ms * 0.65))
                if np.isfinite(raw_delay_ms):
                    throttle_delay_ms = int(np.clip(raw_delay_ms, 0.0, max_valid_delay_ms))

        throttle_jerk = float(chunk[throttle_col].diff().abs().fillna(0.0).mean())
        duration_s = max(0.1, float((chunk['timestamp_ms'].iloc[-1] - chunk['timestamp_ms'].iloc[0]) / 1000.0))

        hard_events = int((chunk['accel_mps2'] > 3.0).sum() + (chunk['accel_mps2'] < -4.0).sum())
        risk_score = int(np.clip(abs(min(peak_decel, 0.0)) * 12 + throttle_jerk * 2.5 + hard_events * 6, 0, 100))

        confidence = 1.0
        if len(chunk) < 25:
            confidence -= 0.2
        if chunk[throttle_col].isna().mean() > 0.2:
            confidence -= 0.2
        if ('lat' not in chunk.columns or 'lng' not in chunk.columns):
            confidence -= 0.2
        confidence = float(np.clip(confidence, 0.35, 1.0))

        issue_scores = {
            'braking_late': abs(min(peak_decel, 0.0)) * 1.3 + braking_distance / 50.0,
            'midcorner_slow': max(0.0, entry_speed - apex_speed),
            'poor_exit': max(0.0, entry_speed - exit_speed) + throttle_delay_ms / 400.0,
            'unstable': throttle_jerk + hard_events * 1.2,
        }
        primary_issue = max(issue_scores, key=issue_scores.get)

        segments.append({
            'segment_id': f'S{index + 1}',
            'start_idx': int(start_idx),
            'end_idx': int(end_idx),
            'entry_speed_kph': entry_speed,
            'apex_speed_kph': apex_speed,
            'exit_speed_kph': exit_speed,
            'braking_distance_m': float(braking_distance),
            'peak_decel_mps2': peak_decel,
            'throttle_delay_ms': throttle_delay_ms,
            'throttle_jerk_score': throttle_jerk,
            'segment_duration_s': duration_s,
            'risk_score_0_100': risk_score,
            'confidence_0_1': confidence,
            'primary_issue': primary_issue,
        })

    if not segments:
        return []

    best_duration = min(s['segment_duration_s'] for s in segments)
    for segment in segments:
        segment['time_delta_vs_best_s'] = float(max(0.0, segment['segment_duration_s'] - best_duration))
        segment.pop('segment_duration_s', None)

    return segments

def _build_coaching(scorecards, segment_analytics):
    if not segment_analytics:
        return {
            'strengths': ['Telemetry captured successfully for this ride.'],
            'weaknesses': ['Not enough segment detail to build coaching advice.'],
            'drills': ['Complete another ride with continuous telemetry for better coaching precision.']
        }

    sorted_segments = sorted(segment_analytics, key=lambda segment: segment['time_delta_vs_best_s'], reverse=True)
    top_issues = sorted_segments[:3]
    issue_counts = pd.Series([segment['primary_issue'] for segment in segment_analytics]).value_counts().to_dict()

    strengths = []
    if (scorecards.get('smoothness_score') or 0) >= 75:
        strengths.append('Throttle and speed transitions are generally smooth across most sections.')
    if (scorecards.get('efficiency_score') or 0) >= 75:
        strengths.append('Good pace-to-efficiency balance with limited over-rev behavior.')
    if (scorecards.get('risk_index') or 100) <= 35:
        strengths.append('Low-risk control profile with limited harsh events.')
    if not strengths:
        strengths.append('Consistent telemetry baseline established; ideal for measurable iteration.')

    weaknesses = [
        f"{segment['segment_id']} loses {segment['time_delta_vs_best_s']:.2f}s mainly due to {segment['primary_issue'].replace('_', ' ')}."
        for segment in top_issues
    ]

    issue_to_drill = {
        'braking_late': 'Brake 5-10m earlier at the worst segment and aim for smoother pressure release.',
        'midcorner_slow': 'Focus on carrying more minimum corner speed with a cleaner, single steering arc.',
        'poor_exit': 'Start throttle roll-on earlier after apex and target progressive increase to full throttle.',
        'unstable': 'Do two control laps at 85% pace to reduce abrupt throttle/brake transitions.'
    }
    drills = []
    for issue, _count in sorted(issue_counts.items(), key=lambda item: item[1], reverse=True)[:2]:
        drills.append(issue_to_drill.get(issue, 'Repeat stable laps and review segment deltas after each stint.'))
    drills.append('Re-run the same route and compare top 3 segment deltas to validate improvements.')

    return {
        'strengths': strengths[:3],
        'weaknesses': weaknesses[:3],
        'drills': drills[:3]
    }


def _sanitize_coaching_lines(raw_items: Any, fallback_items: List[str], max_items: int = 3) -> List[str]:
    cleaned: List[str] = []

    if isinstance(raw_items, list):
        for item in raw_items:
            text = re.sub(r"\s+", " ", str(item or "")).strip()
            if not text:
                continue
            if len(text) > 240:
                text = text[:237].rstrip() + "..."
            if text not in cleaned:
                cleaned.append(text)
            if len(cleaned) >= max_items:
                break

    if cleaned:
        return cleaned[:max_items]

    fallback: List[str] = []
    for item in fallback_items or []:
        text = re.sub(r"\s+", " ", str(item or "")).strip()
        if not text:
            continue
        if text not in fallback:
            fallback.append(text)
        if len(fallback) >= max_items:
            break

    return fallback[:max_items]


def _build_coaching_with_optional_llm(
    scorecards: Dict[str, Any],
    segment_analytics: List[Dict[str, Any]],
    base_coaching: Dict[str, Any],
) -> Dict[str, Any]:
    fallback_payload = {
        "strengths": _sanitize_coaching_lines(base_coaching.get("strengths"), [], max_items=3),
        "weaknesses": _sanitize_coaching_lines(base_coaching.get("weaknesses"), [], max_items=3),
        "drills": _sanitize_coaching_lines(base_coaching.get("drills"), [], max_items=3),
        "llm_enhanced": False,
        "source": "rule_engine",
        "llm_provider": None,
        "llm_model": None,
        "llm_note": "Rule-engine coaching active. LLM enhancement was not used for this response.",
    }

    if not segment_analytics:
        fallback_payload["llm_note"] = "Rule-engine coaching active because segment-level telemetry detail is insufficient for LLM enrichment."
        return fallback_payload

    try:
        registry = _load_llm_provider_registry()
        selected_provider = _resolve_selected_provider(
            registry=registry,
            requested_provider=None,
            requested_model=None,
            api_key=None,
        )

        # Analysis coaching should be automatic and stable; keep a bounded provider timeout.
        selected_provider["timeout_seconds"] = 18

        provider_id = str(selected_provider.get("id") or "unknown-provider")
        model_name = str(selected_provider.get("resolved_model") or selected_provider.get("default_model") or "unknown-model")

        sorted_segments = sorted(
            segment_analytics,
            key=lambda segment: float(segment.get("time_delta_vs_best_s") or 0.0),
            reverse=True,
        )
        top_segments = [
            {
                "segment_id": str(segment.get("segment_id") or "N/A"),
                "time_delta_vs_best_s": round(float(segment.get("time_delta_vs_best_s") or 0.0), 3),
                "primary_issue": str(segment.get("primary_issue") or "unknown"),
                "risk_score_0_100": int(np.clip(float(segment.get("risk_score_0_100") or 0.0), 0, 100)),
                "throttle_delay_ms": int(max(0, float(segment.get("throttle_delay_ms") or 0.0))),
                "peak_decel_mps2": round(float(segment.get("peak_decel_mps2") or 0.0), 3),
            }
            for segment in sorted_segments[:6]
        ]

        issue_distribution = pd.Series([
            str(segment.get("primary_issue") or "unknown")
            for segment in segment_analytics
        ]).value_counts().to_dict()

        prompt_payload = {
            "scorecards": {
                "smoothness_score": int(np.clip(float(scorecards.get("smoothness_score") or 0.0), 0, 100)),
                "efficiency_score": int(np.clip(float(scorecards.get("efficiency_score") or 0.0), 0, 100)),
                "consistency_score": int(np.clip(float(scorecards.get("consistency_score") or 0.0), 0, 100)),
                "risk_index": int(np.clip(float(scorecards.get("risk_index") or 0.0), 0, 100)),
                "estimated_time_loss_s": round(float(scorecards.get("estimated_time_loss_s") or 0.0), 3),
            },
            "issue_distribution": issue_distribution,
            "top_segments": top_segments,
            "rule_engine_coaching": {
                "strengths": fallback_payload["strengths"],
                "weaknesses": fallback_payload["weaknesses"],
                "drills": fallback_payload["drills"],
            },
        }

        llm_prompt = f"""
You are a senior motorcycle race engineer and telemetry performance coach.

Your task is to upgrade a deterministic coaching draft into a production-quality coaching brief.
You must stay grounded strictly in the provided telemetry-derived evidence.

Objectives:
1) Preserve what is already correct from the rule-engine coaching.
2) Improve specificity, sequencing, and measurability of coaching actions.
3) Keep language rider-friendly and concise enough for in-app display.
4) Prioritize highest lap-time impact first.

Hard constraints:
- Do not invent data, events, or segments beyond provided context.
- Do not use internal snake_case wording in final text.
- Do not mention "as an AI".
- Each bullet must be one sentence and actionable.
- Strengths: max 3 bullets, each <= 160 chars.
- Weaknesses: max 3 bullets, each <= 180 chars.
- Drills: max 3 bullets, each <= 190 chars and include a measurable target (pace %, count, delta, or threshold).

Data context (JSON):
{_safe_json_for_prompt(prompt_payload, max_chars=12000)}

Return ONLY valid JSON in this exact schema:
{{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "drills": ["..."],
  "insight_confidence": "high|medium|low",
  "coach_note": "short note explaining confidence and limits in <= 160 chars"
}}
"""

        llm_text = _generate_text_with_provider(selected_provider, llm_prompt)
        llm_payload = _extract_json_dict(llm_text)

        enriched_strengths = _sanitize_coaching_lines(llm_payload.get("strengths"), fallback_payload["strengths"], max_items=3)
        enriched_weaknesses = _sanitize_coaching_lines(llm_payload.get("weaknesses"), fallback_payload["weaknesses"], max_items=3)
        enriched_drills = _sanitize_coaching_lines(llm_payload.get("drills"), fallback_payload["drills"], max_items=3)

        confidence = str(llm_payload.get("insight_confidence") or "medium").strip().lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"

        coach_note = re.sub(r"\s+", " ", str(llm_payload.get("coach_note") or "")).strip()
        if len(coach_note) > 160:
            coach_note = coach_note[:157].rstrip() + "..."

        if not coach_note:
            coach_note = "LLM refinement applied using telemetry scorecards and top segment losses."

        return {
            "strengths": enriched_strengths,
            "weaknesses": enriched_weaknesses,
            "drills": enriched_drills,
            "llm_enhanced": True,
            "source": "llm_enhanced",
            "llm_provider": provider_id,
            "llm_model": model_name,
            "llm_note": f"LLM-enhanced ({provider_id}/{model_name}, confidence: {confidence}). {coach_note}",
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        user_message = str(detail.get("user_message") or detail.get("code") or "provider unavailable")
        fallback_payload["llm_note"] = f"Rule-engine coaching active because LLM enrichment is unavailable: {user_message}."
        return fallback_payload
    except Exception as exc:
        fallback_payload["llm_note"] = f"Rule-engine coaching active because LLM enrichment failed unexpectedly: {str(exc)[:140]}."
        return fallback_payload

def compute_duration_seconds(df: pd.DataFrame) -> int:
    """Derive ride duration from telemetry timestamps, trying common column names."""
    # Normalize column names to lowercase for matching
    col_map = {c.lower(): c for c in df.columns}
    for key in ('timestamp_ms', 'timestamp'):
        if key in col_map and len(df) > 1:
            actual_col = col_map[key]
            try:
                ts = pd.to_numeric(df[actual_col], errors='coerce').dropna()
                if len(ts) > 1:
                    diff = float(ts.max() - ts.min())
                    if diff <= 0:
                        continue
                    # Timestamps in ms are typically > 1e12 (unix epoch)
                    # Diff in ms for a 1hr ride ≈ 3.6e6, for seconds ≈ 3600
                    # If the max value itself looks like epoch ms (> 1e10), diff is in ms
                    if float(ts.max()) > 1e10:
                        return max(1, int(diff / 1000))
                    # Otherwise assume diff is already in seconds
                    return max(1, int(diff))
            except Exception as e:
                print(f"DEBUG compute_duration: error on col {actual_col}: {e}")
                pass
    return 0


def _extract_numeric_series_for_chat(df: pd.DataFrame, columns: List[str]) -> pd.Series:
    for column in columns:
        if column in df.columns:
            return pd.to_numeric(df[column], errors='coerce').fillna(0.0)
    return pd.Series(np.zeros(len(df), dtype=float))


def _extract_gear_series_for_chat(df: pd.DataFrame) -> pd.Series:
    if 'gear_stable' in df.columns:
        return pd.to_numeric(df['gear_stable'], errors='coerce')
    if 'gear' in df.columns:
        return pd.to_numeric(df['gear'], errors='coerce')
    if 'calculated_gear' in df.columns:
        return pd.to_numeric(df['calculated_gear'], errors='coerce')
    return pd.Series(np.full(len(df), np.nan))


def _clamp_score_for_chat(value: float) -> int:
    return int(np.clip(round(value), 0, 100))


def _build_professional_insight_pack_for_chat(
    sliced_df: pd.DataFrame,
    scorecards: Dict[str, Any],
    segment_analytics: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if sliced_df.empty:
        return {
            'racecraft_score': 0,
            'powerband_report': {},
            'shift_quality_report': {},
            'throttle_discipline_report': {},
            'braking_transition_report': {},
            'priority_focus': [],
            'top_segments': [],
        }

    rpm = _extract_numeric_series_for_chat(sliced_df, ['rpm', 'engine_rpm'])
    speed = _extract_numeric_series_for_chat(sliced_df, ['speed_kph'])
    throttle = _extract_numeric_series_for_chat(sliced_df, ['throttle', 'throttle_percent'])
    gear = _extract_gear_series_for_chat(sliced_df)

    under_powerband_pct = float(round(100.0 * (rpm < 4500).mean(), 2))
    in_powerband_pct = float(round(100.0 * ((rpm >= 4500) & (rpm <= 9000)).mean(), 2))
    over_rev_pct = float(round(100.0 * (rpm > 9000).mean(), 2))
    powerband_score = _clamp_score_for_chat(35 + in_powerband_pct - (over_rev_pct * 0.55))

    gear_delta = gear.diff()
    shift_indices = gear_delta[gear_delta.notna() & (gear_delta != 0)].index.tolist()
    late_upshifts = 0
    aggressive_downshifts = 0
    shift_rpms: List[float] = []
    for index in shift_indices:
        delta = float(gear_delta.iloc[index])
        prev_rpm = float(rpm.iloc[index - 1] if index > 0 else rpm.iloc[index])
        prev_speed = float(speed.iloc[index - 1] if index > 0 else speed.iloc[index])
        shift_rpms.append(prev_rpm)
        if delta > 0 and prev_rpm > 9500:
            late_upshifts += 1
        if delta < 0 and prev_rpm > 7000 and prev_speed > 20:
            aggressive_downshifts += 1

    shift_quality_score = _clamp_score_for_chat(95 - (late_upshifts * 7) - (aggressive_downshifts * 6))
    shift_quality_report = {
        'shift_count': int(len(shift_indices)),
        'late_upshift_count': int(late_upshifts),
        'aggressive_downshift_count': int(aggressive_downshifts),
        'median_shift_rpm': int(round(np.median(shift_rpms))) if shift_rpms else 0,
        'shift_quality_score': int(shift_quality_score),
    }

    maintenance_throttle_pct = float(round(100.0 * ((throttle > 0) & (throttle < 12)).mean(), 2))
    high_commit_throttle_pct = float(round(100.0 * (throttle >= 70).mean(), 2))
    abrupt_throttle_change_pct = float(round(100.0 * (throttle.diff().abs() > 35).mean(), 2))
    throttle_discipline_score = _clamp_score_for_chat(
        82 - (maintenance_throttle_pct * 0.35) - (abrupt_throttle_change_pct * 0.4) + (high_commit_throttle_pct * 0.16)
    )
    throttle_discipline_report = {
        'maintenance_throttle_pct': maintenance_throttle_pct,
        'high_commit_throttle_pct': high_commit_throttle_pct,
        'abrupt_throttle_change_pct': abrupt_throttle_change_pct,
        'throttle_discipline_score': int(throttle_discipline_score),
    }

    speed_delta = speed.diff().fillna(0.0)
    decel_mask = speed_delta < -1.0
    hesitation_mask = decel_mask & (throttle > 2) & (throttle < 14)
    hesitation_lengths: List[int] = []
    active_length = 0
    for is_hesitation in hesitation_mask.tolist():
        if is_hesitation:
            active_length += 1
        elif active_length > 0:
            hesitation_lengths.append(active_length)
            active_length = 0
    if active_length > 0:
        hesitation_lengths.append(active_length)

    hesitation_windows = len(hesitation_lengths)
    longest_hesitation = int(max(hesitation_lengths)) if hesitation_lengths else 0
    avg_hesitation = float(round(float(np.mean(hesitation_lengths)), 2)) if hesitation_lengths else 0.0
    brake_to_throttle_score = _clamp_score_for_chat(92 - (hesitation_windows * 6) - (longest_hesitation * 1.2))
    braking_transition_report = {
        'hesitation_windows': int(hesitation_windows),
        'longest_hesitation_samples': int(longest_hesitation),
        'avg_hesitation_samples': avg_hesitation,
        'brake_to_throttle_score': int(brake_to_throttle_score),
    }

    priorities: List[Dict[str, str]] = []
    if late_upshifts > 0:
        priorities.append({
            'theme': 'Shift Timing',
            'reason': f'Late upshifts detected {late_upshifts} times in selected slice',
            'drill': 'Upshift 500–800 RPM earlier on strong exits to stay in efficient powerband',
        })
    if maintenance_throttle_pct > 24:
        priorities.append({
            'theme': 'Throttle Commitment',
            'reason': f'Maintenance throttle is high at {maintenance_throttle_pct}%',
            'drill': 'Use clearer off-throttle braking and earlier progressive roll-on through corner exit',
        })
    if hesitation_windows > 5:
        priorities.append({
            'theme': 'Brake-to-Throttle Transition',
            'reason': f'Found {hesitation_windows} hesitation windows',
            'drill': 'Practice one smooth brake release followed by a single controlled throttle ramp',
        })
    if over_rev_pct > 12:
        priorities.append({
            'theme': 'Powerband Management',
            'reason': f'Over-rev usage at {over_rev_pct}% indicates avoidable top-end dwell',
            'drill': 'Short-shift slightly earlier on traction-limited exits',
        })
    if not priorities:
        priorities.append({
            'theme': 'Consistency',
            'reason': 'No major racecraft anomaly in this slice',
            'drill': 'Repeat this section with tighter line repeatability and compare deltas',
        })

    racecraft_score = _clamp_score_for_chat(np.mean([
        powerband_score,
        shift_quality_score,
        throttle_discipline_score,
        brake_to_throttle_score,
    ]))

    top_segments = sorted(
        segment_analytics,
        key=lambda seg: float(seg.get('time_delta_vs_best_s', 0.0)),
        reverse=True,
    )[:3]

    return {
        'racecraft_score': int(racecraft_score),
        'scorecards': scorecards,
        'powerband_report': {
            'under_powerband_pct': under_powerband_pct,
            'in_powerband_pct': in_powerband_pct,
            'over_rev_pct': over_rev_pct,
            'powerband_efficiency_score': int(powerband_score),
        },
        'shift_quality_report': shift_quality_report,
        'throttle_discipline_report': throttle_discipline_report,
        'braking_transition_report': braking_transition_report,
        'priority_focus': priorities[:4],
        'top_segments': top_segments,
    }


def _build_user_friendly_insight_context_for_prompt(pack: Dict[str, Any]) -> str:
    racecraft_score = int(pack.get('racecraft_score', 0) or 0)
    powerband = pack.get('powerband_report', {}) or {}
    shift_quality = pack.get('shift_quality_report', {}) or {}
    throttle_discipline = pack.get('throttle_discipline_report', {}) or {}
    braking_transition = pack.get('braking_transition_report', {}) or {}
    priorities = pack.get('priority_focus', []) or []

    lines: List[str] = []
    lines.append(f"Racecraft score (0-100): {racecraft_score}")
    lines.append(
        "Powerband usage: "
        f"{powerband.get('under_powerband_pct', 0)}% under band, "
        f"{powerband.get('in_powerband_pct', 0)}% in band, "
        f"{powerband.get('over_rev_pct', 0)}% over-rev"
    )
    lines.append(
        "Shift quality: "
        f"{shift_quality.get('shift_count', 0)} total shifts, "
        f"{shift_quality.get('late_upshift_count', 0)} late upshifts, "
        f"{shift_quality.get('aggressive_downshift_count', 0)} aggressive downshifts, "
        f"median shift RPM {shift_quality.get('median_shift_rpm', 0)}"
    )
    lines.append(
        "Throttle behavior: "
        f"{throttle_discipline.get('maintenance_throttle_pct', 0)}% maintenance throttle, "
        f"{throttle_discipline.get('high_commit_throttle_pct', 0)}% high-commit throttle, "
        f"{throttle_discipline.get('abrupt_throttle_change_pct', 0)}% abrupt changes"
    )
    lines.append(
        "Brake-to-throttle transitions: "
        f"{braking_transition.get('hesitation_windows', 0)} hesitation windows, "
        f"longest hesitation {braking_transition.get('longest_hesitation_samples', 0)} samples"
    )

    if priorities:
        lines.append("Priority coaching focus:")
        for index, priority in enumerate(priorities[:3], start=1):
            theme = str(priority.get('theme', 'Focus Area'))
            reason = str(priority.get('reason', 'No reason available'))
            drill = str(priority.get('drill', 'No drill available'))
            lines.append(f"{index}. {theme} — {reason}. Drill: {drill}")

    return "\n".join(lines)


def _sanitize_model_answer_for_riders(answer_text: str) -> str:
    if not answer_text:
        return answer_text

    replacements = {
        "maintenance_throttle_pct": "maintenance throttle percentage",
        "high_commit_throttle_pct": "high-commit throttle percentage",
        "abrupt_throttle_change_pct": "abrupt throttle-change percentage",
        "brake_to_throttle_score": "brake-to-throttle transition score",
        "throttle_discipline_score": "throttle-discipline score",
        "shift_quality_score": "shift-quality score",
        "powerband_efficiency_score": "powerband efficiency score",
        "under_powerband_pct": "time spent below the powerband",
        "in_powerband_pct": "time spent in the powerband",
        "over_rev_pct": "time spent over-revving",
        "hesitation_windows": "hesitation windows",
        "longest_hesitation_samples": "longest hesitation span",
        "avg_hesitation_samples": "average hesitation span",
        "late_upshift_count": "late upshift count",
        "aggressive_downshift_count": "aggressive downshift count",
        "median_shift_rpm": "median shift RPM",
        "racecraft_score": "racecraft score",
        "estimated_time_loss_s": "estimated time loss (s)",
        "risk_index": "risk index",
    }

    sanitized = answer_text
    for source, target in replacements.items():
        sanitized = re.sub(rf"\b{re.escape(source)}\b", target, sanitized, flags=re.IGNORECASE)

    # Generic safety-net for unknown snake_case tokens that leak through
    generic_pattern = re.compile(r"\b[a-z]+(?:_[a-z0-9]+)+\b")

    def _generic_rewrite(match: re.Match[str]) -> str:
        token = match.group(0)
        if token.lower() in {"elapsed_hms", "elapsed_s"}:
            return "elapsed time"
        return token.replace("_", " ")

    sanitized = generic_pattern.sub(_generic_rewrite, sanitized)
    return sanitized


def _env_bool(name: str, default: bool = True) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except Exception:
        return default
    return int(np.clip(parsed, minimum, maximum))


def _normalize_chat_history_for_prompt(
    history: Any,
    max_messages: int,
    max_chars_per_message: int,
    max_total_chars: int,
) -> List[Dict[str, str]]:
    if not isinstance(history, list):
        return []

    max_messages = int(np.clip(max_messages, 0, 40))
    max_chars_per_message = int(np.clip(max_chars_per_message, 80, 4000))
    max_total_chars = int(np.clip(max_total_chars, 500, 30000))

    cleaned: List[Dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue

        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant"}:
            continue

        raw_content = str(item.get("content") or "").strip()
        if not raw_content:
            continue

        compact_content = re.sub(r"\s+", " ", raw_content).strip()
        if len(compact_content) > max_chars_per_message:
            compact_content = compact_content[:max_chars_per_message].rstrip() + " ..."

        if cleaned and cleaned[-1]["role"] == role and cleaned[-1]["content"] == compact_content:
            continue

        cleaned.append({
            "role": role,
            "content": compact_content,
        })

    if max_messages == 0:
        return []

    cleaned = cleaned[-max_messages:]

    bounded: List[Dict[str, str]] = []
    total_chars = 0
    for turn in reversed(cleaned):
        size = len(turn["content"])

        if bounded and (total_chars + size) > max_total_chars:
            break

        if not bounded and size > max_total_chars:
            clipped_content = turn["content"][-max_total_chars:]
            bounded.append({"role": turn["role"], "content": clipped_content})
            total_chars += len(clipped_content)
            break

        bounded.append(turn)
        total_chars += size

    bounded.reverse()
    return bounded


def _build_chat_history_context(normalized_history: List[Dict[str, str]]) -> str:
    if not normalized_history:
        return ""

    lines: List[str] = ["Conversation history (oldest to newest):"]
    for index, turn in enumerate(normalized_history, start=1):
        speaker = "User" if turn.get("role") == "user" else "Assistant"
        lines.append(f"{index}. {speaker}: {turn.get('content', '')}")

    return "\n".join(lines)


def _load_llm_provider_registry() -> Dict[str, Any]:
    default_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
    providers: Dict[str, Dict[str, Any]] = {
        "gemini-default": {
            "id": "gemini-default",
            "label": "Google AI (Gemini/Gemma)",
            "provider_type": "gemini",
            "default_model": default_model,
            "models": [default_model, "gemma-4-26b-a4b-it", "gemma-2-27b-it", "gemini-2.5-pro", "gemini-2.0-flash-thinking-exp", "gemini-1.5-pro", "gemini-1.5-flash"],
            "api_key_env": "GEMINI_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "openai": {
            "id": "openai",
            "label": "OpenAI",
            "provider_type": "openai",
            "default_model": "gpt-4o",
            "models": ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini", "gpt-4-turbo"],
            "api_key_env": "OPENAI_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "anthropic": {
            "id": "anthropic",
            "label": "Anthropic Claude",
            "provider_type": "anthropic",
            "default_model": "claude-3-7-sonnet-20250219",
            "models": ["claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
            "api_key_env": "ANTHROPIC_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "deepseek": {
            "id": "deepseek",
            "label": "DeepSeek",
            "provider_type": "openai",
            "default_model": "deepseek-chat",
            "models": ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
            "base_url": "https://api.deepseek.com/v1",
            "api_key_env": "DEEPSEEK_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "xai": {
            "id": "xai",
            "label": "xAI (Grok)",
            "provider_type": "openai",
            "default_model": "grok-2-latest",
            "models": ["grok-2-latest", "grok-beta"],
            "base_url": "https://api.x.ai/v1",
            "api_key_env": "XAI_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "mistral": {
            "id": "mistral",
            "label": "Mistral AI",
            "provider_type": "openai",
            "default_model": "mistral-large-latest",
            "models": ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "ministral-8b-latest", "ministral-3b-latest", "pixtral-large-latest", "pixtral-12b-2409"],
            "base_url": "https://api.mistral.ai/v1",
            "api_key_env": "MISTRAL_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
        "groq": {
            "id": "groq",
            "label": "Groq",
            "provider_type": "openai",
            "default_model": "llama-3.3-70b-versatile",
            "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
            "base_url": "https://api.groq.com/openai/v1",
            "api_key_env": "GROQ_API_KEY",
            "reasoning_supported": True,
            "enabled": True,
            "allow_custom_models": True,
        },
    }

    raw = os.getenv("LLM_PROVIDERS_JSON", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            entries: List[Dict[str, Any]] = []

            if isinstance(parsed, dict):
                for provider_id, payload in parsed.items():
                    if isinstance(payload, dict):
                        payload_copy = dict(payload)
                        payload_copy.setdefault("id", str(provider_id))
                        entries.append(payload_copy)
            elif isinstance(parsed, list):
                entries = [entry for entry in parsed if isinstance(entry, dict)]

            for entry in entries:
                provider_id = str(entry.get("id") or "").strip()
                if not provider_id:
                    continue

                provider_type = str(
                    entry.get("provider_type")
                    or entry.get("provider")
                    or "openai_compatible"
                ).strip().lower()

                models = entry.get("models") or []
                if not isinstance(models, list):
                    models = []
                models = [str(model).strip() for model in models if str(model).strip()]

                default_entry_model = str(
                    entry.get("default_model")
                    or entry.get("model")
                    or (models[0] if models else default_model)
                ).strip()

                if default_entry_model and default_entry_model not in models:
                    models = [default_entry_model, *models]

                providers[provider_id] = {
                    "id": provider_id,
                    "label": str(entry.get("label") or entry.get("name") or provider_id),
                    "provider_type": provider_type,
                    "default_model": default_entry_model or default_model,
                    "models": models or [default_entry_model or default_model],
                    "api_key_env": str(entry.get("api_key_env") or "").strip(),
                    "base_url": str(entry.get("base_url") or "").strip(),
                    "chat_path": str(entry.get("chat_path") or "/chat/completions").strip(),
                    "timeout_seconds": float(entry.get("timeout_seconds") or 60),
                    "temperature": entry.get("temperature"),
                    "max_tokens": entry.get("max_tokens"),
                    "headers": entry.get("headers") if isinstance(entry.get("headers"), dict) else {},
                    "extra_body": entry.get("extra_body") if isinstance(entry.get("extra_body"), dict) else {},
                    "reasoning_supported": bool(entry.get("reasoning_supported", True)),
                    "enabled": bool(entry.get("enabled", True)),
                    "allow_custom_models": bool(entry.get("allow_custom_models", True)),
                }
        except Exception:
            pass

    enabled_providers = {key: value for key, value in providers.items() if value.get("enabled", True)}
    if not enabled_providers:
        enabled_providers = providers

    configured_default = os.getenv("LLM_DEFAULT_PROVIDER", "").strip()
    if configured_default and configured_default in enabled_providers:
        default_provider_id = configured_default
    else:
        default_provider_id = "gemini-default" if "gemini-default" in enabled_providers else next(iter(enabled_providers.keys()))

    return {
        "default_provider_id": default_provider_id,
        "providers": enabled_providers,
    }

def _get_dynamic_models(provider: Dict[str, Any]) -> List[str]:
    provider_id = str(provider.get("id"))
    now = time.time()
    
    # Check cache first
    cached = _MODEL_CACHE.get(provider_id)
    if cached and (now - cached["timestamp"]) < _CACHE_TTL_SECONDS:
        return cached["models"]

    provider_type = provider.get("provider_type")
    fetched_models: List[str] = []
    
    try:
        if provider_type == "gemini":
            api_key_env = str(provider.get("api_key_env") or "GEMINI_API_KEY").strip() or "GEMINI_API_KEY"
            api_key = str(provider.get("api_key") or os.getenv(api_key_env, "")).strip()
            if api_key:
                client = genai.Client(api_key=api_key)
                # fetch models
                for m in client.models.list():
                    name = m.name.replace("models/", "")
                    if name.startswith("gemini") or name.startswith("gemma"):
                        fetched_models.append(name)
        else:
            base_url = str(provider.get("base_url") or "").strip()
            api_key_env = str(provider.get("api_key_env") or "OPENAI_API_KEY").strip()
            api_key = str(provider.get("api_key") or os.getenv(api_key_env, "")).strip()
            
            if base_url and api_key:
                url = base_url.rstrip("/") + "/models"
                headers = {"Authorization": f"Bearer {api_key}"}
                response = httpx.get(url, headers=headers, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    if "data" in data and isinstance(data["data"], list):
                        for m in data["data"]:
                            if isinstance(m, dict) and "id" in m:
                                fetched_models.append(str(m["id"]))
    except Exception as e:
        print(f"Failed to fetch dynamic models for {provider_id}: {e}")
        pass

    # Fallback to configured default if fetch failed
    if not fetched_models:
        fetched_models = provider.get("models") or []

    # Update cache
    _MODEL_CACHE[provider_id] = {
        "timestamp": now,
        "models": fetched_models,
    }
    return fetched_models


def _build_public_provider_catalog(registry: Dict[str, Any]) -> Dict[str, Any]:
    providers: Dict[str, Dict[str, Any]] = registry.get("providers", {})
    options: List[LlmProviderOption] = []

    for provider in providers.values():
        dynamic_models = _get_dynamic_models(provider)
        
        options.append(
            LlmProviderOption(
                id=str(provider.get("id") or ""),
                label=str(provider.get("label") or provider.get("id") or "LLM Provider"),
                provider_type=str(provider.get("provider_type") or "openai_compatible"),
                default_model=str(provider.get("default_model") or ""),
                models=dynamic_models,
                reasoning_supported=bool(provider.get("reasoning_supported", True)),
            )
        )

    options.sort(key=lambda item: item.label.lower())

    return {
        "default_provider_id": str(registry.get("default_provider_id") or ""),
        "providers": options,
    }


def _resolve_selected_provider(registry: Dict[str, Any], requested_provider: Optional[str], requested_model: Optional[str], api_key: Optional[str] = None) -> Dict[str, Any]:
    providers: Dict[str, Dict[str, Any]] = registry.get("providers", {})
    selected_provider_id = (requested_provider or registry.get("default_provider_id") or "").strip()

    if not selected_provider_id or selected_provider_id not in providers:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "LLM_PROVIDER_NOT_FOUND",
                "user_message": "Selected LLM provider is not available.",
                "provider": selected_provider_id,
            },
        )

    provider = dict(providers[selected_provider_id])
    if api_key:
        provider["api_key"] = api_key.strip()

    requested_model_clean = (requested_model or "").strip()
    available_models = [str(model).strip() for model in (provider.get("models") or []) if str(model).strip()]
    allow_custom_models = bool(provider.get("allow_custom_models", True))

    if requested_model_clean:
        if (requested_model_clean in available_models) or allow_custom_models:
            resolved_model = requested_model_clean
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "LLM_MODEL_NOT_ALLOWED",
                    "user_message": "Selected model is not allowed for this provider.",
                    "provider": selected_provider_id,
                    "model": requested_model_clean,
                    "available_models": available_models,
                },
            )
    else:
        resolved_model = str(provider.get("default_model") or (available_models[0] if available_models else "")).strip()

    provider["resolved_model"] = resolved_model
    return provider


def _extract_retry_after_seconds(raw_text: str) -> Optional[int]:
    if not raw_text:
        return None

    first_match = re.search(r"retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", raw_text, flags=re.IGNORECASE)
    if first_match:
        try:
            return max(1, int(float(first_match.group(1))))
        except Exception:
            return None

    second_match = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?([0-9]+)s", raw_text, flags=re.IGNORECASE)
    if second_match:
        try:
            return max(1, int(second_match.group(1)))
        except Exception:
            return None

    return None


def _raise_llm_http_error(provider: Dict[str, Any], model_name: str, status_code: int, raw_error: str) -> None:
    provider_id = str(provider.get("id") or "unknown-provider")
    lowered = (raw_error or "").lower()
    retry_after = _extract_retry_after_seconds(raw_error)

    if status_code == 429 or "resource_exhausted" in lowered or "quota" in lowered or "rate limit" in lowered:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "LLM_QUOTA_EXCEEDED",
                "user_message": "LLM quota/rate limit reached. Please retry shortly or switch to another model/provider.",
                "provider": provider_id,
                "model": model_name,
                "retry_after_seconds": retry_after,
                "raw_error": raw_error,
            },
        )

    if status_code in {401, 403} or "unauthorized" in lowered or "invalid api key" in lowered:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "LLM_AUTH_FAILED",
                "user_message": "LLM provider credentials are invalid or missing. Contact admin to fix provider configuration.",
                "provider": provider_id,
                "model": model_name,
                "raw_error": raw_error,
            },
        )

    raise HTTPException(
        status_code=502,
        detail={
            "code": "LLM_UPSTREAM_ERROR",
            "user_message": f"The selected LLM provider failed to generate a response. Please retry or choose another provider. Details: {str(raw_error)[:300]}",
            "provider": provider_id,
            "model": model_name,
            "raw_error": raw_error,
        },
    )


def _generate_text_with_provider(provider: Dict[str, Any], prompt: str) -> str:
    provider_type = str(provider.get("provider_type") or "openai_compatible").lower()
    model_name = str(provider.get("resolved_model") or provider.get("default_model") or "").strip()
    if not model_name:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "LLM_MODEL_MISSING",
                "user_message": "No model configured for selected LLM provider.",
                "provider": str(provider.get("id") or "unknown-provider"),
            },
        )

    if provider_type == "gemini":
        api_key_env = str(provider.get("api_key_env") or "GEMINI_API_KEY").strip() or "GEMINI_API_KEY"
        api_key = str(provider.get("api_key") or os.getenv(api_key_env, "")).strip()
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "LLM_CREDENTIALS_MISSING",
                    "user_message": f"Missing API key env var '{api_key_env}' for selected LLM provider.",
                    "provider": str(provider.get("id") or "gemini"),
                    "model": model_name,
                },
            )

        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(model=model_name, contents=prompt)
            return (response.text or "").strip()
        except HTTPException:
            raise
        except Exception as exc:
            _raise_llm_http_error(provider, model_name, status_code=502, raw_error=str(exc))

    # For all OpenAI-compatible providers:
    base_url = str(provider.get("base_url") or "").strip()
    api_key_env = str(provider.get("api_key_env") or "OPENAI_API_KEY").strip()
    
    # Look for the API key in the provider dictionary first (from frontend), then fall back to env 
    api_key = str(provider.get("api_key") or os.getenv(api_key_env, "")).strip()
    
    chat_path = str(provider.get("chat_path") or "/chat/completions").strip()
    # Default chat path missing from config should fallback to /chat/completions
    if not chat_path:
        chat_path = "/chat/completions"
        
    timeout_seconds = float(provider.get("timeout_seconds") or 60)

    if not base_url:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "LLM_BASE_URL_MISSING",
                "user_message": "Selected OpenAI-compatible provider is missing base_url configuration.",
                "provider": str(provider.get("id") or "openai-compatible"),
                "model": model_name,
            },
        )

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "LLM_CREDENTIALS_MISSING",
                "user_message": f"Missing API key env var '{api_key_env}' for selected LLM provider.",
                "provider": str(provider.get("id") or "openai-compatible"),
                "model": model_name,
            },
        )

    url = base_url.rstrip("/") + (chat_path if chat_path.startswith("/") else f"/{chat_path}")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    extra_headers = provider.get("headers") or {}
    if isinstance(extra_headers, dict):
        headers.update({str(k): str(v) for k, v in extra_headers.items()})

    body: Dict[str, Any] = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
    }

    temperature = provider.get("temperature")
    if temperature is not None:
        body["temperature"] = temperature

    max_tokens = provider.get("max_tokens")
    if max_tokens is not None:
        body["max_tokens"] = max_tokens

    extra_body = provider.get("extra_body") or {}
    if isinstance(extra_body, dict):
        body.update(extra_body)

    try:
        response = httpx.post(url, headers=headers, json=body, timeout=timeout_seconds)
    except Exception as exc:
        _raise_llm_http_error(provider, model_name, status_code=502, raw_error=str(exc))

    raw_text = response.text or ""
    if response.status_code >= 400:
        _raise_llm_http_error(provider, model_name, status_code=int(response.status_code), raw_error=raw_text)

    try:
        payload = response.json()
    except Exception:
        payload = {}

    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        _raise_llm_http_error(provider, model_name, status_code=502, raw_error="Missing choices in OpenAI-compatible response")

    message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_chunks: List[str] = []
        for item in content:
            if isinstance(item, dict):
                maybe_text = item.get("text")
                if isinstance(maybe_text, str):
                    text_chunks.append(maybe_text)
        if text_chunks:
            return "\n".join(text_chunks).strip()

    _raise_llm_http_error(provider, model_name, status_code=502, raw_error="Empty or unsupported content in OpenAI-compatible response")
    return ""


def _extract_json_dict(text: str) -> Dict[str, Any]:
    if not text:
        return {}

    candidate = text.strip()
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}

    try:
        parsed = json.loads(candidate[start:end + 1])
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _replace_raw_epoch_timestamps(answer_text: str) -> str:
    if not answer_text:
        return answer_text
    return re.sub(r"\b\d{12,}\b", "the selected time marker", answer_text)


def _deterministic_answer_issues(answer_text: str) -> List[str]:
    issues: List[str] = []

    if not answer_text or len(answer_text.strip()) < 40:
        issues.append("Answer is too short and may miss key reasoning details")

    if re.search(r"\b\d{12,}\b", answer_text):
        issues.append("Contains raw epoch timestamp; use +HH:MM:SS references only")

    if re.search(r"\b[a-z]+(?:_[a-z0-9]+)+\b", answer_text):
        issues.append("Contains internal snake_case field names; use rider-friendly wording")

    return issues


def _run_iterative_reasoning_for_chat(
    generate_text: Callable[[str], str],
    base_prompt: str,
    telemetry_csv_context: str,
    professional_context: str,
    user_question: str,
    max_rounds: int,
) -> Dict[str, Any]:
    draft_prompt = f"""
{base_prompt}

Now produce the best possible rider-facing answer.
Requirements:
- Keep it concise but high signal.
- Ground claims only in the telemetry slice and professional context above.
- Prefer timing references in +HH:MM:SS.
- If uncertain, explicitly call out ambiguity.
- Include clear, measurable next-step coaching where relevant.
"""

    candidate = (generate_text(draft_prompt) or "").strip()
    round_trace: List[Dict[str, Any]] = []

    for round_index in range(max_rounds):
        deterministic_issues = _deterministic_answer_issues(candidate)
        critique_prompt = f"""
You are a strict telemetry answer verifier and editor.

User question:
{user_question}

Telemetry slice (CSV):
{telemetry_csv_context}

Professional context:
{professional_context}

Candidate answer to verify:
{candidate}

Deterministic issues already detected:
{json.dumps(deterministic_issues)}

Task:
1) Check factual consistency against telemetry and context.
2) Check clarity and practical coaching quality.
3) Correct the candidate if needed.

Return JSON only in this exact shape:
{{
  "verdict": "pass" | "revise",
  "confidence": 0.0,
  "issues": ["..."],
  "revised_answer": "..."
}}

Rules:
- No raw epoch timestamps.
- No snake_case/internal field names.
- Use rider-friendly, race-engineer style language.
- Keep revised_answer concise and actionable.
"""

        try:
            critique_payload = _extract_json_dict(generate_text(critique_prompt) or "")
        except HTTPException as critique_exc:
            if int(getattr(critique_exc, "status_code", 0) or 0) == 429:
                round_trace.append(
                    {
                        "round": round_index + 1,
                        "verdict": "fallback",
                        "confidence": 0.0,
                        "issues": ["Critique/refinement skipped due to LLM quota limit"],
                        "post_issues": _deterministic_answer_issues(candidate),
                    }
                )
                break
            raise

        verdict = str(critique_payload.get("verdict", "revise")).strip().lower()
        confidence = critique_payload.get("confidence", 0.0)
        critique_issues = critique_payload.get("issues", [])
        revised_answer = str(critique_payload.get("revised_answer", "") or "").strip()

        if revised_answer:
            candidate = revised_answer

        post_issues = _deterministic_answer_issues(candidate)
        round_trace.append(
            {
                "round": round_index + 1,
                "verdict": verdict,
                "confidence": confidence,
                "issues": critique_issues if isinstance(critique_issues, list) else [],
                "post_issues": post_issues,
            }
        )

        if verdict == "pass" and not post_issues:
            break

    candidate = _sanitize_model_answer_for_riders(candidate)
    candidate = _replace_raw_epoch_timestamps(candidate)

    return {
        "answer": candidate,
        "round_trace": round_trace,
        "rounds_completed": len(round_trace),
    }


def _safe_json_for_prompt(value: Any, max_chars: int = 9000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = str(value)

    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]} ...[truncated]"


def _build_mcp_tool_specs_for_chat() -> List[Dict[str, Any]]:
    return [
        {
            "name": "thinking_query_for_ride",
            "description": "Two-step MCP planner that routes the query to relevant analytics tools and returns a combined answer.",
            "arguments": {
                "query": "string",
            },
        },
        {
            "name": "get_llm_insight_pack",
            "description": "Compact racecraft insight pack (scorecards, events, segments, coaching) tuned for LLM grounding.",
            "arguments": {},
        },
        {
            "name": "get_track_professional_insights",
            "description": "Pro racecraft diagnostics: powerband, shift quality, throttle discipline, and transition quality.",
            "arguments": {},
        },
        {
            "name": "get_scorecards",
            "description": "Returns smoothness, efficiency, consistency, and risk scorecards.",
            "arguments": {},
        },
        {
            "name": "get_events",
            "description": "Returns braking/acceleration events and their count.",
            "arguments": {},
        },
        {
            "name": "get_powerband_report",
            "description": "Returns under-band / in-band / over-rev usage and powerband efficiency score.",
            "arguments": {},
        },
        {
            "name": "get_shift_quality_report",
            "description": "Returns shift quality diagnostics including late upshifts and aggressive downshifts.",
            "arguments": {},
        },
        {
            "name": "get_throttle_discipline_report",
            "description": "Returns throttle discipline statistics and stability indicators.",
            "arguments": {},
        },
        {
            "name": "get_braking_transition_report",
            "description": "Returns brake-to-throttle transition hesitation diagnostics.",
            "arguments": {},
        },
        {
            "name": "run_full_analysis_for_ride",
            "description": "Runs full analytics stack and returns metrics/events/segments/scorecards/coaching.",
            "arguments": {},
        },
        {
            "name": "list_recent_rides",
            "description": "Lists recent rides with summary stats.",
            "arguments": {
                "limit": "number (1-30)",
            },
        },
    ]


def _build_default_mcp_tool_calls_for_question(
    user_question: str,
    max_calls: int,
) -> List[Dict[str, Any]]:
    lowered = (user_question or "").lower()
    keywords = [
        "why",
        "compare",
        "improve",
        "drill",
        "segment",
        "risk",
        "insight",
        "coaching",
        "powerband",
        "shift",
        "throttle",
        "brake",
        "event",
        "score",
        "analyze",
    ]
    should_call = any(token in lowered for token in keywords) or len((user_question or "").strip()) >= 32
    if not should_call or max_calls < 1:
        return []

    return [
        {
            "name": "thinking_query_for_ride",
            "arguments": {
                "query": (user_question or "").strip()[:600],
            },
        }
    ]


def _normalize_mcp_tool_calls_for_chat(
    raw_calls: Any,
    ride_id: str,
    user_question: str,
    max_calls: int,
) -> List[Dict[str, Any]]:
    if not isinstance(raw_calls, list) or max_calls < 1:
        return []

    allowed_tool_names = {entry["name"] for entry in _build_mcp_tool_specs_for_chat()}
    normalized: List[Dict[str, Any]] = []

    for raw_call in raw_calls:
        if not isinstance(raw_call, dict):
            continue

        tool_name = str(raw_call.get("name") or raw_call.get("tool") or "").strip()
        if tool_name not in allowed_tool_names:
            continue

        arguments = raw_call.get("arguments")
        if not isinstance(arguments, dict):
            arguments = {}
        arguments = dict(arguments)

        if tool_name != "list_recent_rides":
            arguments["ride_id"] = ride_id

        if tool_name == "thinking_query_for_ride":
            query = str(arguments.get("query") or user_question or "").strip()
            arguments["query"] = query[:600]

        if tool_name == "list_recent_rides":
            try:
                limit = int(arguments.get("limit", 10))
            except Exception:
                limit = 10
            arguments["limit"] = int(np.clip(limit, 1, 30))

        normalized.append({
            "name": tool_name,
            "arguments": arguments,
        })

        if len(normalized) >= max_calls:
            break

    return normalized


def _build_mcp_local_context_for_chat(ride_id: str, cache: Dict[str, Any]) -> Dict[str, Any]:
    cached = cache.get(ride_id)
    if isinstance(cached, dict):
        return cached

    from .. import mcp_server

    frames = mcp_server._fetch_ride_frames(ride_id)
    df = mcp_server._prepare_dataframe(frames)
    full = mcp_server._run_full_analytics(frames)
    professional_insights = mcp_server._build_track_professional_insights(df, full)
    llm_pack = mcp_server._build_llm_insight_pack(ride_id, full, professional_insights)

    payload = {
        "frames": frames,
        "df": df,
        "full": full,
        "professional_insights": professional_insights,
        "llm_pack": llm_pack,
        "powerband_report": mcp_server._powerband_report(df),
        "shift_quality_report": mcp_server._shift_quality_report(df),
        "throttle_discipline_report": mcp_server._throttle_discipline_report(df),
        "braking_transition_report": mcp_server._braking_transition_report(df),
    }
    cache[ride_id] = payload
    return payload


def _execute_mcp_tool_call_local(
    tool_name: str,
    arguments: Dict[str, Any],
    ride_id: str,
    user_question: str,
    cache: Dict[str, Any],
) -> Any:
    from .. import mcp_server

    if tool_name == "list_recent_rides":
        limit = int(np.clip(int(arguments.get("limit", 10)), 1, 30))
        session = mcp_server.SessionLocal()
        try:
            rides = session.query(mcp_server.models.Ride).order_by(mcp_server.models.Ride.started_at.desc()).limit(limit).all()
            return [
                {
                    "id": ride.id,
                    "title": ride.title,
                    "started_at": ride.started_at.isoformat() if ride.started_at else None,
                    "duration_seconds": int(ride.duration_seconds or 0),
                    "avg_speed": float(ride.avg_speed or 0.0),
                    "max_speed": float(ride.max_speed or 0.0),
                }
                for ride in rides
            ]
        finally:
            session.close()

    local = _build_mcp_local_context_for_chat(ride_id, cache)
    full = local["full"]
    df = local["df"]
    professional_insights = local["professional_insights"]
    llm_pack = local["llm_pack"]

    if tool_name == "thinking_query_for_ride":
        query = str(arguments.get("query") or user_question or "").strip()[:600]
        intent_payload = mcp_server._classify_query_intents(query)
        tool_graph = mcp_server._build_tool_graph_plan(intent_payload)
        answer = mcp_server._project_answer_from_full(
            full,
            tool_graph["requested_outputs"],
            professional_insights,
            llm_pack,
        )
        intent_scores = [intent["score"] for intent in intent_payload["intents"].values()]
        confidence_score = round(float(np.mean(intent_scores)), 3) if intent_scores else 0.42

        return {
            "ride_id": ride_id,
            "query": query,
            "selected_tools": tool_graph["selected_tools"],
            "answer": answer,
            "planner": {
                "step_1_intent_classification": intent_payload,
                "step_2_tool_graph": tool_graph,
            },
            "execution_trace": {
                "executed_node": "load_ride_context",
                "execution_order": tool_graph["execution_order"],
                "projection_outputs": tool_graph["requested_outputs"],
            },
            "confidence": {
                "label": "high" if confidence_score >= 0.7 else "medium",
                "score": confidence_score,
            },
        }

    if tool_name == "get_llm_insight_pack":
        return llm_pack
    if tool_name == "get_track_professional_insights":
        return {
            "ride_id": ride_id,
            "track_professional_insights": professional_insights,
        }
    if tool_name == "get_scorecards":
        return {
            "ride_id": ride_id,
            "scorecards": full.get("scorecards", {}),
        }
    if tool_name == "get_events":
        events = full.get("events", [])
        return {
            "ride_id": ride_id,
            "count": len(events),
            "events": events,
        }
    if tool_name == "get_powerband_report":
        return {
            "ride_id": ride_id,
            "powerband_report": local["powerband_report"],
        }
    if tool_name == "get_shift_quality_report":
        return {
            "ride_id": ride_id,
            "shift_quality_report": local["shift_quality_report"],
        }
    if tool_name == "get_throttle_discipline_report":
        return {
            "ride_id": ride_id,
            "throttle_discipline_report": local["throttle_discipline_report"],
        }
    if tool_name == "get_braking_transition_report":
        return {
            "ride_id": ride_id,
            "braking_transition_report": local["braking_transition_report"],
        }
    if tool_name == "run_full_analysis_for_ride":
        payload = dict(full)
        payload["ride_id"] = ride_id
        return payload

    raise ValueError(f"Unsupported MCP tool '{tool_name}'")


def _execute_mcp_tool_call(
    tool_name: str,
    arguments: Dict[str, Any],
    ride_id: str,
    user_question: str,
    cache: Dict[str, Any],
) -> Any:
    from .. import mcp_server

    auth_token = os.getenv("MCP_CHAT_AUTH_TOKEN", "").strip() or os.getenv("MCP_AUTH_TOKEN", "").strip() or None
    use_wrappers = _env_bool("TELEMETRY_MCP_USE_TOOL_WRAPPERS", True)

    if use_wrappers:
        try:
            auth_required = bool(mcp_server._is_auth_required())
            token_store = mcp_server._load_token_store() if auth_required else {}

            if auth_required and not token_store:
                use_wrappers = False
            elif auth_required and token_store and (not auth_token or auth_token not in token_store):
                use_wrappers = False
        except Exception:
            pass

    if not use_wrappers:
        return _execute_mcp_tool_call_local(tool_name, arguments, ride_id, user_question, cache)

    wrapper_calls: Dict[str, Callable[[], Any]] = {
        "thinking_query_for_ride": lambda: mcp_server.thinking_query_for_ride(
            ride_id=ride_id,
            query=str(arguments.get("query") or user_question or "").strip()[:600],
            auth_token=auth_token,
        ),
        "get_llm_insight_pack": lambda: mcp_server.get_llm_insight_pack(ride_id=ride_id, auth_token=auth_token),
        "get_track_professional_insights": lambda: mcp_server.get_track_professional_insights(ride_id=ride_id, auth_token=auth_token),
        "get_scorecards": lambda: mcp_server.get_scorecards(ride_id=ride_id, auth_token=auth_token),
        "get_events": lambda: mcp_server.get_events(ride_id=ride_id, auth_token=auth_token),
        "get_powerband_report": lambda: mcp_server.get_powerband_report(ride_id=ride_id, auth_token=auth_token),
        "get_shift_quality_report": lambda: mcp_server.get_shift_quality_report(ride_id=ride_id, auth_token=auth_token),
        "get_throttle_discipline_report": lambda: mcp_server.get_throttle_discipline_report(ride_id=ride_id, auth_token=auth_token),
        "get_braking_transition_report": lambda: mcp_server.get_braking_transition_report(ride_id=ride_id, auth_token=auth_token),
        "run_full_analysis_for_ride": lambda: mcp_server.run_full_analysis_for_ride(ride_id=ride_id, auth_token=auth_token),
        "list_recent_rides": lambda: mcp_server.list_recent_rides(
            limit=int(np.clip(int(arguments.get("limit", 10)), 1, 30)),
            auth_token=auth_token,
        ),
    }

    call = wrapper_calls.get(tool_name)
    if call is None:
        raise ValueError(f"Unsupported MCP tool '{tool_name}'")

    try:
        return call()
    except Exception as exc:
        lowered = str(exc).lower()
        auth_error_hints = [
            "auth_token",
            "token",
            "scope",
            "mcp auth",
            "permission",
            "not grant required scope",
        ]
        if any(hint in lowered for hint in auth_error_hints):
            return _execute_mcp_tool_call_local(tool_name, arguments, ride_id, user_question, cache)
        raise


def _compact_mcp_tool_result(tool_name: str, result: Any) -> Any:
    if tool_name == "thinking_query_for_ride" and isinstance(result, dict):
        return {
            "selected_tools": result.get("selected_tools"),
            "answer": result.get("answer"),
            "confidence": result.get("confidence"),
        }

    if tool_name == "run_full_analysis_for_ride" and isinstance(result, dict):
        return {
            "ride_id": result.get("ride_id"),
            "metrics": result.get("metrics"),
            "scorecards": result.get("scorecards"),
            "coaching": result.get("coaching"),
            "segment_analytics_top3": (result.get("segment_analytics") or [])[:3],
        }

    if isinstance(result, dict):
        compact = dict(result)
        if isinstance(compact.get("events"), list) and len(compact["events"]) > 10:
            compact["events"] = compact["events"][:10]
            compact["events_truncated"] = True
        if isinstance(compact.get("segment_analytics"), list) and len(compact["segment_analytics"]) > 5:
            compact["segment_analytics"] = compact["segment_analytics"][:5]
            compact["segment_analytics_truncated"] = True
        return compact

    if isinstance(result, list):
        if len(result) <= 10:
            return result
        return {
            "items": result[:10],
            "truncated_count": len(result) - 10,
        }

    return str(result)


def _run_mcp_tool_calling_for_chat(
    generate_text: Callable[[str], str],
    ride_id: str,
    user_question: str,
    max_calls: int,
) -> Dict[str, Any]:
    tools_used: List[str] = ["MCP Tool Planner"]
    progress_updates: List[str] = ["Evaluated whether MCP function calls are required"]
    max_calls = int(np.clip(max_calls, 1, 6))

    planner_payload: Dict[str, Any] = {}
    llm_planner_enabled = _env_bool("TELEMETRY_MCP_LLM_PLANNER_ENABLED", False)

    if llm_planner_enabled:
        tool_specs = _build_mcp_tool_specs_for_chat()
        planner_prompt = f"""
You are deciding whether backend MCP analytics tools should be called before answering a telemetry question.

Ride ID: {ride_id}
User question: {user_question}

Available MCP tools (JSON):
{json.dumps(tool_specs, ensure_ascii=False)}

Return JSON only in this exact shape:
{{
  "needs_tools": true,
  "reason": "short reason",
  "tool_calls": [
    {{"name": "thinking_query_for_ride", "arguments": {{"query": "..."}}}}
  ]
}}

Rules:
- Use only tools from the provided list.
- Maximum {max_calls} tool calls.
- Do not include auth_token.
- For ride-specific tools, ride_id is already provided by backend.
- If uncertain, prefer a single call to thinking_query_for_ride.
"""

        try:
            planner_payload = _extract_json_dict(generate_text(planner_prompt) or "")
            progress_updates.append("Used LLM-based MCP planner")
        except Exception:
            planner_payload = {}
            progress_updates.append("MCP planner call failed; using deterministic fallback")
    else:
        progress_updates.append("Using deterministic MCP planner (LLM planner disabled)")

    needs_tools = bool(planner_payload.get("needs_tools", True))
    planned_calls = _normalize_mcp_tool_calls_for_chat(
        raw_calls=planner_payload.get("tool_calls"),
        ride_id=ride_id,
        user_question=user_question,
        max_calls=max_calls,
    )

    if not planned_calls and needs_tools:
        planned_calls = _build_default_mcp_tool_calls_for_question(user_question=user_question, max_calls=max_calls)

    if not planned_calls:
        progress_updates.append("No MCP tool call needed for this question")
        return {
            "context": "",
            "tools_used": tools_used,
            "progress_updates": progress_updates,
        }

    cache: Dict[str, Any] = {}
    tool_outputs: List[Dict[str, Any]] = []

    for call in planned_calls:
        tool_name = str(call.get("name") or "").strip()
        if not tool_name:
            continue

        arguments = call.get("arguments") if isinstance(call.get("arguments"), dict) else {}

        try:
            result = _execute_mcp_tool_call(
                tool_name=tool_name,
                arguments=arguments,
                ride_id=ride_id,
                user_question=user_question,
                cache=cache,
            )
            compact_result = _compact_mcp_tool_result(tool_name, result)
            tool_outputs.append({
                "tool": tool_name,
                "result": compact_result,
            })
            tools_used.append(f"MCP Tool: {tool_name}")
            progress_updates.append(f"Executed MCP tool call: {tool_name}")
        except Exception as exc:
            tool_outputs.append({
                "tool": tool_name,
                "error": str(exc)[:240],
            })
            tools_used.append(f"MCP Tool Failed: {tool_name}")
            progress_updates.append(f"MCP tool call failed: {tool_name}")

    if not tool_outputs:
        return {
            "context": "",
            "tools_used": tools_used,
            "progress_updates": progress_updates,
        }

    context = (
        "Additional MCP tool outputs generated for this question (JSON):\n"
        f"{_safe_json_for_prompt(tool_outputs, max_chars=9000)}\n"
        "Use this MCP output as factual context. If it conflicts with telemetry slice context, explicitly state the ambiguity."
    )

    return {
        "context": context,
        "tools_used": tools_used,
        "progress_updates": progress_updates,
    }

def _normalize_laps(raw_laps: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    if not raw_laps:
        return []

    normalized: List[Dict[str, Any]] = []
    for idx, lap in enumerate(raw_laps, start=1):
        if not isinstance(lap, dict):
            continue

        lap_number = lap.get('lap_number', lap.get('lapNumber', idx))
        started_at = lap.get('started_at', lap.get('startedAt'))
        ended_at = lap.get('ended_at', lap.get('endedAt'))
        duration_ms = lap.get('duration_ms', lap.get('durationMs', 0))

        try:
            lap_number = int(lap_number)
        except Exception:
            lap_number = idx

        try:
            duration_ms = max(0, int(duration_ms))
        except Exception:
            duration_ms = 0

        if not started_at or not ended_at:
            continue

        normalized.append({
            'lap_number': lap_number,
            'started_at': str(started_at),
            'ended_at': str(ended_at),
            'duration_ms': duration_ms,
        })

    normalized.sort(key=lambda item: (item['lap_number'], item['started_at']))
    return normalized


def _looks_like_gzip_payload(payload: bytes) -> bool:
    return len(payload) >= 2 and payload[0] == 0x1F and payload[1] == 0x8B


def _parse_ride_create_payload(
    raw_payload: bytes,
    content_encoding: str = "",
    content_type: str = "",
) -> RideCreate:
    if not raw_payload:
        raise HTTPException(status_code=400, detail="Empty request body")

    encoding = (content_encoding or "").lower()
    mime_type = (content_type or "").lower()
    parsed_bytes = raw_payload

    should_decompress = (
        "gzip" in encoding
        or "application/gzip" in mime_type
        or _looks_like_gzip_payload(raw_payload)
    )

    if should_decompress:
        try:
            parsed_bytes = gzip.decompress(raw_payload)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid gzip-compressed upload payload")

    max_json_bytes = int(os.getenv("MAX_RIDE_UPLOAD_JSON_BYTES", "26214400"))
    if len(parsed_bytes) > max_json_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                "Ride upload payload too large after decompression. "
                f"Limit is {max_json_bytes} bytes."
            ),
        )

    try:
        payload_obj = json.loads(parsed_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in ride upload payload")

    if not isinstance(payload_obj, dict):
        raise HTTPException(status_code=400, detail="Ride upload payload must be a JSON object")

    try:
        return RideCreate(**payload_obj)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid ride upload fields: {str(exc)}")


def _persist_uploaded_ride(ride_data: RideCreate, db: Session, current_user: User):
    existing = db.query(Ride).filter(Ride.id == ride_data.id).first()
    if existing:
        return {"status": "already_exists", "ride_id": existing.id}

    df = pd.DataFrame(ride_data.frames)

    max_speed = float(df['speed_kph'].max()) if not df.empty and 'speed_kph' in df else 0.0
    avg_speed = float(df['speed_kph'].mean()) if not df.empty and 'speed_kph' in df else 0.0
    max_rpm = int(df['rpm'].max()) if not df.empty and 'rpm' in df else 0

    max_lean_left = 0.0
    max_lean_right = 0.0
    if not df.empty and 'lean_angle' in df:
        left_leans = df[df['lean_angle'] < 0]['lean_angle']
        right_leans = df[df['lean_angle'] > 0]['lean_angle']
        max_lean_left = abs(float(left_leans.min())) if not left_leans.empty else 0.0
        max_lean_right = float(right_leans.max()) if not right_leans.empty else 0.0

    duration = compute_duration_seconds(df)
    laps = _normalize_laps(ride_data.laps)

    total_distance_km = 0.0
    if not df.empty and 'lat' in df.columns and 'lng' in df.columns:
        lat_s = pd.to_numeric(df['lat'], errors='coerce')
        lng_s = pd.to_numeric(df['lng'], errors='coerce')
        valid = pd.DataFrame({'lat': lat_s, 'lng': lng_s}).dropna()
        if len(valid) > 1:
            dists = _haversine_m(
                valid['lat'].values[:-1], valid['lng'].values[:-1],
                valid['lat'].values[1:],  valid['lng'].values[1:],
            )
            total_distance_km = float(np.nansum(dists)) / 1000.0

    new_ride = Ride(
        id=ride_data.id,
        started_at=ride_data.started_at,
        title=ride_data.title,
        max_speed=max_speed,
        avg_speed=avg_speed,
        max_lean_left=max_lean_left,
        max_lean_right=max_lean_right,
        max_rpm=max_rpm,
        duration_seconds=duration,
        total_distance_km=total_distance_km,
        telemetry_blob=ride_data.frames,
        laps=laps,
        visibility="private",
        owner_id=current_user.id,
        bike_id=ride_data.bike_id
    )

    db.add(new_ride)
    db.commit()
    db.refresh(new_ride)

    return {"status": "success", "ride_id": new_ride.id}


def _get_chunk_limits() -> Dict[str, int]:
    max_chunks = int(os.getenv("MAX_RIDE_UPLOAD_CHUNKS", "128"))
    max_chunk_bytes = int(os.getenv("MAX_RIDE_UPLOAD_CHUNK_BYTES", "1048576"))
    max_compressed_bytes = int(os.getenv("MAX_RIDE_UPLOAD_COMPRESSED_BYTES", "52428800"))
    return {
        "max_chunks": max_chunks,
        "max_chunk_bytes": max_chunk_bytes,
        "max_compressed_bytes": max_compressed_bytes,
    }


_RIDE_VISIBILITY_VALUES = {"private", "friends", "public", "link_only"}


def _normalize_optional_datetime(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _has_active_share_link(db: Session, ride_id: str) -> bool:
    now = datetime.utcnow()
    return (
        db.query(models.RideShareLink.id)
        .filter(
            models.RideShareLink.ride_id == ride_id,
            models.RideShareLink.revoked_at.is_(None),
            or_(
                models.RideShareLink.expires_at.is_(None),
                models.RideShareLink.expires_at > now,
            ),
        )
        .first()
        is not None
    )


def _are_friends(db: Session, owner_id: int, other_user_id: int) -> bool:
    return (
        db.query(models.Friendship)
        .filter(
            models.Friendship.user_id == owner_id,
            models.Friendship.friend_id == other_user_id,
        )
        .first()
        is not None
    )


def _can_user_view_ride(db: Session, ride: Ride, user: Optional[User]) -> bool:
    if user is not None and ride.owner_id == user.id:
        return True

    visibility = (ride.visibility or "private").lower()
    if visibility == "public":
        return True
    if visibility == "friends" and user is not None:
        return _are_friends(db, ride.owner_id, user.id)
    return False


def _share_base_url(request: Optional[Request] = None) -> str:
    configured = (os.getenv("RIDE_SHARE_BASE_URL") or "").strip()
    if configured:
        return configured
    if request is not None:
        return f"{str(request.base_url).rstrip('/')}/api/v1/rides/shared/link"
    return "http://localhost:8008/api/v1/rides/shared/link"


def _app_deep_link_base() -> str:
    return os.getenv("PULSECRAFT_APP_DEEP_LINK_BASE", "pulsecraft://shared/link")


def _to_share_link_out(link: models.RideShareLink, request: Optional[Request] = None) -> RideShareLinkOut:
    base_url = _share_base_url(request=request).rstrip("/")
    return RideShareLinkOut(
        id=link.id,
        ride_id=link.ride_id,
        token=link.token,
        share_url=f"{base_url}/{link.token}",
        created_at=link.created_at,
        expires_at=link.expires_at,
        revoked_at=link.revoked_at,
    )


def _resolve_shared_link_ride(db: Session, token: str) -> tuple[models.RideShareLink, Ride]:
        link = (
                db.query(models.RideShareLink)
                .filter(models.RideShareLink.token == token)
                .first()
        )
        if not link:
                raise HTTPException(status_code=404, detail="Share link not found")

        now = datetime.utcnow()
        if link.revoked_at is not None:
                raise HTTPException(status_code=410, detail="Share link has been revoked")
        if link.expires_at is not None and link.expires_at <= now:
                raise HTTPException(status_code=410, detail="Share link has expired")

        ride = db.query(Ride).filter(Ride.id == link.ride_id).first()
        if not ride:
                raise HTTPException(status_code=404, detail="Ride not found")
        visibility = (ride.visibility or "private").lower()
        if visibility not in _RIDE_VISIBILITY_VALUES:
            raise HTTPException(status_code=403, detail="Ride visibility is invalid")
        if visibility == "private":
                raise HTTPException(status_code=403, detail="Ride is private")

        link.last_accessed_at = now
        db.commit()

        _decorate_ride_response(ride)
        return link, ride


def _format_duration_seconds(total_seconds: Optional[int]) -> str:
        seconds = max(int(total_seconds or 0), 0)
        mins, secs = divmod(seconds, 60)
        hours, mins = divmod(mins, 60)
        if hours > 0:
                return f"{hours}h {mins}m"
        if mins > 0:
                return f"{mins}m {secs}s"
        return f"{secs}s"


def _extract_share_map_points(telemetry_blob: Any, max_points: int = 280) -> List[List[float]]:
    if not isinstance(telemetry_blob, list):
        return []

    raw_points: List[List[float]] = []
    for frame in telemetry_blob:
        if not isinstance(frame, dict):
            continue

        lat_value = frame.get("lat")
        if lat_value is None:
            lat_value = frame.get("latitude")

        lng_value = frame.get("lng")
        if lng_value is None:
            lng_value = frame.get("lon")
        if lng_value is None:
            lng_value = frame.get("longitude")

        try:
            lat = float(lat_value)
            lng = float(lng_value)
        except Exception:
            continue

        if not np.isfinite(lat) or not np.isfinite(lng):
            continue
        if abs(lat) > 90 or abs(lng) > 180:
            continue

        raw_points.append([round(lat, 6), round(lng, 6)])

    if len(raw_points) <= max_points:
        return raw_points

    sampled_indexes = np.linspace(0, len(raw_points) - 1, num=max_points, dtype=int).tolist()
    sampled_points = [raw_points[index] for index in sampled_indexes]
    return sampled_points


def _bike_display_name(ride: Ride) -> Optional[str]:
    bike = ride.bike
    if bike is None and ride.bike_id is not None:
        lookup_session = object_session(ride)
        if lookup_session is not None:
            bike = (
                lookup_session.query(models.Bike)
                .filter(models.Bike.id == ride.bike_id)
                .first()
            )

    if bike is None:
        return f"Bike #{ride.bike_id}" if ride.bike_id is not None else None

    make = (bike.make or "").strip()
    model = (bike.model or "").strip()
    year = str(bike.year).strip() if bike.year else ""
    make_model = " ".join(part for part in [make, model] if part)

    if year and make_model:
        return f"{year} {make_model}"
    if make_model:
        return make_model

    bike_name = (bike.name or "").strip()
    if year and bike_name:
        return f"{year} {bike_name}"
    return bike_name or None


def _decorate_ride_response(ride: Ride, map_points_limit: int = 140) -> None:
    if ride.laps is None:
        ride.laps = []

    owner_name = (ride.owner.full_name or ride.owner.email) if ride.owner else None
    setattr(ride, "owner_name", owner_name)
    setattr(ride, "bike_name", _bike_display_name(ride))
    setattr(
        ride,
        "map_preview_points",
        _extract_share_map_points(getattr(ride, "telemetry_blob", None), max_points=map_points_limit),
    )


def _render_shared_ride_page(token: str, ride: Ride, request: Request) -> str:
        owner = getattr(ride, "owner_name", None) or "PulseCraft rider"
        title = ride.title or "Shared Ride"
        started_at_text = (ride.started_at or datetime.utcnow()).strftime("%d %b %Y, %I:%M %p")
        deep_link = f"{_app_deep_link_base().rstrip('/')}/{token}"
        web_json_url = f"{request.base_url}api/v1/rides/shared/link/{token}?format=json"
        map_points = _extract_share_map_points(getattr(ride, "telemetry_blob", None))
        map_points_json = json.dumps(map_points)

        return f"""<!doctype html>
<html lang=\"en\">
<head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{escape(title)} - PulseCraft</title>
    <meta name=\"description\" content=\"{escape(owner)} shared a ride with you on PulseCraft.\" />
    <link rel=\"stylesheet\" href=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css\" />
    <style>
        :root {{
            --bg0: #070a12;
            --bg1: #0e1628;
            --glass: rgba(255, 255, 255, 0.08);
            --border: rgba(255, 255, 255, 0.22);
            --text: #e8ecff;
            --muted: #aeb6d6;
            --accent: #9db7ff;
            --ok: #17d3e3;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            font-family: "Segoe UI", "SF Pro Text", "Helvetica Neue", sans-serif;
            color: var(--text);
            background:
                radial-gradient(50rem 30rem at 8% 90%, rgba(16, 177, 196, 0.17), transparent 60%),
                radial-gradient(50rem 30rem at 92% 8%, rgba(157, 183, 255, 0.22), transparent 60%),
                linear-gradient(165deg, var(--bg0), var(--bg1));
            display: grid;
            place-items: center;
            padding: 20px;
        }}
        .card {{
            width: min(560px, 100%);
            border-radius: 24px;
            border: 1px solid var(--border);
            background: linear-gradient(145deg, rgba(255, 255, 255, 0.14), var(--glass));
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            padding: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }}
        .chip {{
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: var(--ok);
            border: 1px solid rgba(23, 211, 227, 0.4);
            border-radius: 999px;
            padding: 6px 10px;
        }}
        h1 {{ margin: 14px 0 6px; font-size: 30px; line-height: 1.15; }}
        p {{ margin: 0; color: var(--muted); }}
        .stats {{
            margin-top: 18px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
        }}
        .stat {{
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(10, 14, 26, 0.42);
            padding: 10px 12px;
        }}
        .stat .label {{ font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }}
        .stat .value {{ margin-top: 6px; font-size: 20px; font-weight: 700; color: var(--text); }}
        .map-wrap {{
            margin-top: 16px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.16);
            overflow: hidden;
            background: rgba(10, 14, 26, 0.42);
        }}
        .map-head {{
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }}
        .map-head h2 {{
            margin: 0;
            font-size: 13px;
            letter-spacing: .06em;
            text-transform: uppercase;
            color: var(--muted);
        }}
        #ride-map {{
            width: 100%;
            height: 260px;
        }}
        .map-fallback {{
            height: 260px;
            display: grid;
            place-items: center;
            color: var(--muted);
            font-size: 14px;
            padding: 0 18px;
            text-align: center;
        }}
        .actions {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }}
        .btn {{
            appearance: none;
            border: 0;
            border-radius: 12px;
            padding: 11px 16px;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
        }}
        .btn-primary {{ background: var(--accent); color: #18213b; }}
        .btn-secondary {{ background: rgba(255,255,255,.12); color: var(--text); border: 1px solid rgba(255,255,255,.2); }}
        .foot {{ margin-top: 12px; font-size: 12px; color: #92a0cc; }}
        @media (max-width: 560px) {{
            .card {{ padding: 18px; border-radius: 18px; }}
            h1 {{ font-size: 24px; }}
        }}
    </style>
</head>
<body>
    <main class=\"card\">
        <span class=\"chip\">Shared from PulseCraft</span>
        <h1>{escape(title)}</h1>
        <p>by {escape(owner)} • {escape(started_at_text)}</p>

        <section class=\"stats\">
            <article class=\"stat\"><div class=\"label\">Distance</div><div class=\"value\">{(ride.total_distance_km or 0.0):.1f} km</div></article>
            <article class=\"stat\"><div class=\"label\">Avg Speed</div><div class=\"value\">{(ride.avg_speed or 0.0):.1f} km/h</div></article>
            <article class=\"stat\"><div class=\"label\">Duration</div><div class=\"value\">{escape(_format_duration_seconds(ride.duration_seconds))}</div></article>
        </section>

        <section class=\"map-wrap\">
            <div class=\"map-head\"><h2>Route Map</h2></div>
            <div id=\"ride-map\"></div>
        </section>

        <div class=\"actions\">
            <a class=\"btn btn-primary\" id=\"open-app\" href=\"{escape(deep_link)}\">Open In App</a>
            <a class=\"btn btn-secondary\" href=\"{escape(web_json_url)}\">View Raw Link API</a>
        </div>

        <p class=\"foot\">If the app is not installed, stay on this page to view summary details.</p>
    </main>

    <script src=\"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js\"></script>
    <script>
        (function() {{
            var deepLink = {json.dumps(deep_link)};
            var mapPoints = {map_points_json};
            var mapEl = document.getElementById("ride-map");

            function renderMapFallback(message) {{
                if (!mapEl) return;
                mapEl.innerHTML = '<div class="map-fallback">' + message + '</div>';
            }}

            if (Array.isArray(mapPoints) && mapPoints.length > 1 && window.L && mapEl) {{
                var map = L.map(mapEl, {{ zoomControl: true }});
                L.tileLayer("https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png", {{
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap contributors'
                }}).addTo(map);

                var route = L.polyline(mapPoints, {{ color: '#9db7ff', weight: 4, opacity: 0.9 }}).addTo(map);
                var start = mapPoints[0];
                var end = mapPoints[mapPoints.length - 1];
                L.circleMarker(start, {{ radius: 5, color: '#17d3e3', fillColor: '#17d3e3', fillOpacity: 1 }}).addTo(map);
                L.circleMarker(end, {{ radius: 5, color: '#ffffff', fillColor: '#ffffff', fillOpacity: 1 }}).addTo(map);
                map.fitBounds(route.getBounds(), {{ padding: [20, 20] }});
            }} else {{
                renderMapFallback('Route map is unavailable for this shared ride.');
            }}

            var ua = navigator.userAgent || "";
            var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
            if (!isMobile) return;

            var opened = false;
            var clickBtn = document.getElementById("open-app");
            if (clickBtn) {{
                clickBtn.addEventListener("click", function() {{ opened = true; }});
            }}

            setTimeout(function() {{
                if (!opened) {{
                    window.location.href = deepLink;
                }}
            }}, 350);
        }})();
    </script>
</body>
</html>"""


def _render_share_error_page(detail: str) -> str:
        safe_detail = escape(detail or "Unable to open this ride link")
        return f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<title>Ride Link Unavailable</title>
<style>
    body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:linear-gradient(165deg,#070a12,#0e1628); color:#e8ecff; font-family:"Segoe UI",sans-serif; padding:20px; }}
    .card {{ width:min(480px,100%); padding:22px; border-radius:18px; border:1px solid rgba(255,255,255,.22); background:rgba(255,255,255,.08); backdrop-filter: blur(12px); }}
    h1 {{ margin:0 0 8px; font-size:26px; }}
    p {{ margin:0; color:#b7c0e2; }}
</style></head>
<body><main class=\"card\"><h1>Ride Link Unavailable</h1><p>{safe_detail}</p></main></body></html>"""


@router.post("/upload_chunked/init", status_code=status.HTTP_201_CREATED)
def init_chunked_ride_upload(
    payload: Dict[str, Any],
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride_id = str(payload.get("ride_id") or "").strip()
    if not ride_id:
        raise HTTPException(status_code=400, detail="ride_id is required")

    total_chunks_raw = payload.get("total_chunks")
    try:
        total_chunks = int(total_chunks_raw)
    except Exception:
        raise HTTPException(status_code=400, detail="total_chunks must be an integer")

    limits = _get_chunk_limits()
    if total_chunks <= 0:
        raise HTTPException(status_code=400, detail="total_chunks must be > 0")
    if total_chunks > limits["max_chunks"]:
        raise HTTPException(
            status_code=400,
            detail=f"total_chunks exceeds limit ({limits['max_chunks']})",
        )

    content_encoding = str(payload.get("content_encoding") or "gzip")
    content_type = str(payload.get("content_type") or "application/json")

    session = models.RideUploadSession(
        id=str(uuid.uuid4()),
        ride_id=ride_id,
        owner_id=current_user.id,
        total_chunks=total_chunks,
        uploaded_chunks=0,
        content_encoding=content_encoding,
        content_type=content_type,
        status="pending",
    )
    db.add(session)
    db.commit()

    return {
        "upload_id": session.id,
        "ride_id": ride_id,
        "total_chunks": total_chunks,
        "status": "pending",
    }


@router.post("/upload_chunked/{upload_id}/chunk", status_code=status.HTTP_201_CREATED)
async def upload_ride_chunk(
    upload_id: str,
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    session = db.query(models.RideUploadSession).filter(
        models.RideUploadSession.id == upload_id,
        models.RideUploadSession.owner_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")
    if session.status != "pending":
        raise HTTPException(status_code=400, detail=f"Upload session is {session.status}")
    if chunk_index < 0 or chunk_index >= session.total_chunks:
        raise HTTPException(status_code=400, detail="chunk_index out of range")

    payload = await chunk.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty chunk payload")

    limits = _get_chunk_limits()
    if len(payload) > limits["max_chunk_bytes"]:
        raise HTTPException(
            status_code=413,
            detail=(
                f"Chunk too large ({len(payload)} bytes). "
                f"Limit is {limits['max_chunk_bytes']} bytes"
            ),
        )

    existing_chunk = db.query(models.RideUploadChunk).filter(
        models.RideUploadChunk.session_id == session.id,
        models.RideUploadChunk.chunk_index == chunk_index,
    ).first()

    if existing_chunk:
        existing_chunk.content = payload
        existing_chunk.byte_size = len(payload)
    else:
        db.add(models.RideUploadChunk(
            session_id=session.id,
            chunk_index=chunk_index,
            byte_size=len(payload),
            content=payload,
        ))

    db.commit()

    uploaded_count = db.query(models.RideUploadChunk).filter(
        models.RideUploadChunk.session_id == session.id,
    ).count()
    session.uploaded_chunks = uploaded_count
    db.commit()

    return {
        "upload_id": session.id,
        "chunk_index": chunk_index,
        "uploaded_chunks": uploaded_count,
        "total_chunks": session.total_chunks,
        "status": "pending",
    }


@router.post("/upload_chunked/{upload_id}/complete", status_code=status.HTTP_201_CREATED)
def complete_chunked_ride_upload(
    upload_id: str,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    session = db.query(models.RideUploadSession).filter(
        models.RideUploadSession.id == upload_id,
        models.RideUploadSession.owner_id == current_user.id,
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Upload session not found")

    if session.status == "completed":
        return {
            "status": "already_completed",
            "ride_id": session.ride_id,
            "upload_id": session.id,
        }

    ordered_chunks = db.query(models.RideUploadChunk).filter(
        models.RideUploadChunk.session_id == session.id,
    ).order_by(models.RideUploadChunk.chunk_index.asc()).all()

    if len(ordered_chunks) != session.total_chunks:
        raise HTTPException(
            status_code=409,
            detail=(
                "Upload incomplete: "
                f"received {len(ordered_chunks)}/{session.total_chunks} chunks"
            ),
        )

    for expected_idx, chunk in enumerate(ordered_chunks):
        if chunk.chunk_index != expected_idx:
            raise HTTPException(
                status_code=409,
                detail=f"Missing chunk index {expected_idx}",
            )

    joined_payload = b"".join(chunk.content for chunk in ordered_chunks)
    limits = _get_chunk_limits()
    if len(joined_payload) > limits["max_compressed_bytes"]:
        raise HTTPException(
            status_code=413,
            detail=(
                "Compressed upload too large. "
                f"Limit is {limits['max_compressed_bytes']} bytes"
            ),
        )

    ride_data = _parse_ride_create_payload(
        raw_payload=joined_payload,
        content_encoding=session.content_encoding,
        content_type=session.content_type,
    )

    result = _persist_uploaded_ride(ride_data, db, current_user)

    session.status = "completed"
    session.completed_at = datetime.utcnow()
    session.uploaded_chunks = session.total_chunks
    db.query(models.RideUploadChunk).filter(
        models.RideUploadChunk.session_id == session.id,
    ).delete(synchronize_session=False)
    db.commit()

    result["upload_id"] = session.id
    return result

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_ride(request: Request, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    raw_payload = await request.body()
    ride_data = _parse_ride_create_payload(
        raw_payload=raw_payload,
        content_encoding=request.headers.get("content-encoding", ""),
        content_type=request.headers.get("content-type", ""),
    )
    return _persist_uploaded_ride(ride_data, db, current_user)


@router.post("/upload_csv", status_code=status.HTTP_201_CREATED)
async def upload_csv(bike_id: int = None, file: UploadFile = File(...), db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    print(f"DEBUG: Received CSV upload request. Filename: {file.filename}, Content-Type: {file.content_type}")
    try:
        content = await file.read()
        print(f"DEBUG: Read {len(content)} bytes")
        
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        try:
            df = pd.read_csv(io.BytesIO(content))
            print(f"DEBUG: DataFrame shape: {df.shape}")
            print(f"DEBUG: Columns: {df.columns.tolist()}")
        except Exception as parse_err:
            print(f"DEBUG: Pandas parse error: {parse_err}")
            raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(parse_err)}")

        # Standardize columns
        # Expected: timestamp, speed_kph, rpm, lean_angle, throttle_percent, accel_x, accel_y, accel_z, lat, lng
        # Mapping common variations
        column_map = {
            'speed_kmph': 'speed_kph',
            'speed': 'speed_kph',
            'vehicle_speed': 'speed_kph',
            'engine_rpm': 'rpm',
            'throttle': 'throttle_percent',
            'latitude': 'lat',
            'longitude': 'lng',
            'calculated_gear': 'calculated_gear',
            'coolant_temp_c': 'coolant_temp_c',
            'intake_pressure_kpa': 'intake_pressure_kpa'
        }
        
        # Check if target columns already exist before renaming to avoid duplicates
        # If 'engine_rpm' exists and we want to rename it to 'rpm', but 'rpm' also exists...
        # We need to decide strategy. Let's drop the original 'rpm' if 'engine_rpm' is present (assuming engine_rpm is better labeled)
        # OR just drop duplicates after rename.
        
        # Normalize all columns to lowercase first
        df.columns = [c.lower().strip() for c in df.columns]

        df.rename(columns=column_map, inplace=True)
        
        # Remove duplicate columns (keep first)
        df = df.loc[:, ~df.columns.duplicated()]
        
        # Calculate summary stats
        max_speed = float(df['speed_kph'].max()) if 'speed_kph' in df else 0.0
        avg_speed = float(df['speed_kph'].mean()) if 'speed_kph' in df else 0.0
        max_rpm = int(df['rpm'].max()) if 'rpm' in df else 0
        
        max_lean_left = 0.0
        max_lean_right = 0.0
        if 'lean_angle' in df:
            left_leans = df[df['lean_angle'] < 0]['lean_angle']
            right_leans = df[df['lean_angle'] > 0]['lean_angle']
            max_lean_left = abs(float(left_leans.min())) if not left_leans.empty else 0.0
            max_lean_right = float(right_leans.max()) if not right_leans.empty else 0.0

        duration = compute_duration_seconds(df)

        # GPS distance
        total_distance_km = 0.0
        if 'lat' in df.columns and 'lng' in df.columns:
            lat_s = pd.to_numeric(df['lat'], errors='coerce')
            lng_s = pd.to_numeric(df['lng'], errors='coerce')
            valid = pd.DataFrame({'lat': lat_s, 'lng': lng_s}).dropna()
            if len(valid) > 1:
                dists = _haversine_m(
                    valid['lat'].values[:-1], valid['lng'].values[:-1],
                    valid['lat'].values[1:],  valid['lng'].values[1:],
                )
                total_distance_km = float(np.nansum(dists)) / 1000.0

        # Determine start time from telemetry or current time
        started_at = datetime.utcnow()

        ride_id = str(uuid.uuid4())

        new_ride = Ride(
            id=ride_id,
            started_at=started_at,
            title=f"Imported Ride {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            max_speed=max_speed,
            avg_speed=avg_speed,
            max_lean_left=max_lean_left,
            max_lean_right=max_lean_right,
            max_rpm=max_rpm,
            duration_seconds=duration,
            total_distance_km=total_distance_km,
            telemetry_blob=df.to_dict('records'),
            laps=[],
            visibility="private",
            owner_id=current_user.id,
            bike_id=bike_id
        )
        
        db.add(new_ride)
        db.commit()
        db.refresh(new_ride)
        
        return {"status": "success", "ride_id": new_ride.id, "message": f"Imported {len(df)} points"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"DEBUG: General Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to process upload: {str(e)}")


@router.get("/", response_model=List[RideSummary])
def list_rides(skip: int = 0, limit: int = 50, bike_id: int = None, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    query = db.query(Ride).filter(Ride.owner_id == current_user.id)
    if bike_id is not None:
        from sqlalchemy import or_
        query = query.filter(or_(Ride.bike_id == bike_id, Ride.bike_id.is_(None)))
    rides = query.order_by(Ride.started_at.desc()).offset(skip).limit(limit).all()

    # Lazy backfill duration for rides that had the old stub (duration=0)
    for ride in rides:
        if ride.laps is None:
            ride.laps = []
        if ride.duration_seconds == 0 and ride.telemetry_blob:
            df = pd.DataFrame(ride.telemetry_blob)
            print(f"DEBUG backfill ride={ride.id}: cols={df.columns.tolist()[:8]}, rows={len(df)}")
            computed = compute_duration_seconds(df)
            print(f"DEBUG backfill ride={ride.id}: computed duration={computed}s")
            if computed > 0:
                db.query(Ride).filter(Ride.id == ride.id).update({"duration_seconds": computed})
                ride.duration_seconds = computed
        # Lazy backfill total_distance_km for rides uploaded before the fix
        if (ride.total_distance_km is None or ride.total_distance_km == 0.0) and ride.telemetry_blob:
            df_dist = pd.DataFrame(ride.telemetry_blob)
            if 'lat' in df_dist.columns and 'lng' in df_dist.columns:
                lat_s = pd.to_numeric(df_dist['lat'], errors='coerce')
                lng_s = pd.to_numeric(df_dist['lng'], errors='coerce')
                valid = pd.DataFrame({'lat': lat_s, 'lng': lng_s}).dropna()
                if len(valid) > 1:
                    dists = _haversine_m(
                        valid['lat'].values[:-1], valid['lng'].values[:-1],
                        valid['lat'].values[1:],  valid['lng'].values[1:],
                    )
                    computed_dist = float(np.nansum(dists)) / 1000.0
                    if computed_dist > 0:
                        db.query(Ride).filter(Ride.id == ride.id).update({"total_distance_km": computed_dist})
                        ride.total_distance_km = computed_dist
        _decorate_ride_response(ride)
    db.commit()

    return rides


@router.get("/shared/feed", response_model=List[RideSummary])
def list_shared_feed(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    friend_ids = [
        row.friend_id
        for row in db.query(models.Friendship.friend_id)
        .filter(models.Friendship.user_id == current_user.id)
        .all()
    ]

    query = db.query(Ride).filter(Ride.owner_id != current_user.id)
    if friend_ids:
        query = query.filter(
            or_(
                Ride.visibility == "public",
                ((Ride.visibility == "friends") & (Ride.owner_id.in_(friend_ids))),
            )
        )
    else:
        query = query.filter(Ride.visibility == "public")

    rides = query.order_by(Ride.started_at.desc()).offset(skip).limit(limit).all()
    for ride in rides:
        _decorate_ride_response(ride)
    return rides


@router.get("/shared/{ride_id}", response_model=RideDetail)
def get_shared_ride(
    ride_id: str,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    if not _can_user_view_ride(db, ride, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view this ride")

    _decorate_ride_response(ride)
    return ride


@router.get("/shared/link/{token}", response_model=RideDetail)
def get_shared_ride_by_link(
    token: str,
    request: Request,
    format: Optional[str] = Query(None),
    db: Session = Depends(database.get_db),
):
    accept_header = (request.headers.get("accept") or "").lower()
    wants_html = ("text/html" in accept_header) and (format or "").lower() != "json"

    try:
        link, ride = _resolve_shared_link_ride(db, token)
    except HTTPException as exc:
        if wants_html:
            return HTMLResponse(
                content=_render_share_error_page(str(exc.detail)),
                status_code=exc.status_code,
            )
        raise

    if wants_html:
        return HTMLResponse(content=_render_shared_ride_page(token=token, ride=ride, request=request))
    return ride


@router.put("/{ride_id}/visibility", response_model=RideSummary)
def update_ride_visibility(
    ride_id: str,
    payload: RideVisibilityUpdate,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    visibility = (payload.visibility or "").strip().lower()
    if visibility not in _RIDE_VISIBILITY_VALUES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid visibility. Allowed values: {sorted(_RIDE_VISIBILITY_VALUES)}",
        )

    ride.visibility = visibility
    if visibility == "private":
        db.query(models.RideShareLink).filter(
            models.RideShareLink.ride_id == ride.id,
            models.RideShareLink.revoked_at.is_(None),
        ).update(
            {models.RideShareLink.revoked_at: datetime.utcnow()},
            synchronize_session=False,
        )
    elif visibility == "link_only" and not _has_active_share_link(db, ride.id):
        # Prevent dead-end link_only state by ensuring at least one active link exists.
        db.add(
            models.RideShareLink(
                ride_id=ride.id,
                token=secrets.token_urlsafe(32),
                created_by_id=current_user.id,
            )
        )

    db.commit()
    db.refresh(ride)
    _decorate_ride_response(ride)
    return ride


@router.post("/{ride_id}/share-links", response_model=RideShareLinkOut, status_code=status.HTTP_201_CREATED)
def create_ride_share_link(
    ride_id: str,
    payload: RideShareLinkCreate,
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    expires_at = _normalize_optional_datetime(payload.expires_at)
    now = datetime.utcnow()
    if expires_at is not None and expires_at <= now:
        raise HTTPException(status_code=400, detail="expires_at must be in the future")

    link = models.RideShareLink(
        ride_id=ride.id,
        token=secrets.token_urlsafe(32),
        created_by_id=current_user.id,
        expires_at=expires_at,
    )
    db.add(link)

    if (ride.visibility or "private").lower() == "private":
        ride.visibility = "link_only"

    db.commit()
    db.refresh(link)
    return _to_share_link_out(link, request=request)


@router.get("/{ride_id}/share-links", response_model=List[RideShareLinkOut])
def list_ride_share_links(
    ride_id: str,
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    links = (
        db.query(models.RideShareLink)
        .filter(models.RideShareLink.ride_id == ride.id)
        .order_by(models.RideShareLink.created_at.desc())
        .all()
    )
    return [_to_share_link_out(link, request=request) for link in links]


@router.delete("/{ride_id}/share-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_ride_share_link(
    ride_id: str,
    link_id: int,
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    link = (
        db.query(models.RideShareLink)
        .filter(
            models.RideShareLink.id == link_id,
            models.RideShareLink.ride_id == ride.id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    if link.revoked_at is None:
        link.revoked_at = datetime.utcnow()

        if (ride.visibility or "private").lower() == "link_only":
            has_remaining_active_links = (
                db.query(models.RideShareLink.id)
                .filter(
                    models.RideShareLink.ride_id == ride.id,
                    models.RideShareLink.id != link.id,
                    models.RideShareLink.revoked_at.is_(None),
                    or_(
                        models.RideShareLink.expires_at.is_(None),
                        models.RideShareLink.expires_at > datetime.utcnow(),
                    ),
                )
                .first()
                is not None
            )
            if not has_remaining_active_links:
                ride.visibility = "private"

        db.commit()
    return None

@router.get("/{ride_id}", response_model=RideDetail)
def get_ride(ride_id: str, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this ride")
    _decorate_ride_response(ride)
    return ride

@router.put("/{ride_id}/update", response_model=RideSummary)
def update_ride(ride_id: str, payload: RideUpdate, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if payload.title is not None:
        new_title = payload.title.strip()
        if not new_title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        db.query(Ride).filter(Ride.id == ride_id).update({"title": new_title})
        db.commit()
        ride.title = new_title
    _decorate_ride_response(ride)
    return ride

@router.get("/{ride_id}/analysis", response_model=RideAnalysisResponse)
def get_ride_analysis(
    ride_id: str,
    force_refresh: bool = Query(False),
    db: Session = Depends(database.get_db),
    current_user: User = Depends(auth.get_current_user),
):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this analysis")

    if not force_refresh and ride.analysis_blob:
        cached_blob = ride.analysis_blob if isinstance(ride.analysis_blob, dict) else {}
        cached_coaching = cached_blob.get("coaching") if isinstance(cached_blob, dict) else None

        if isinstance(cached_coaching, dict) and "llm_note" not in cached_coaching:
            retro_base = {
                "strengths": cached_coaching.get("strengths") or [],
                "weaknesses": cached_coaching.get("weaknesses") or [],
                "drills": cached_coaching.get("drills") or [],
            }
            retro_scorecards = cached_blob.get("scorecards") if isinstance(cached_blob.get("scorecards"), dict) else {}
            retro_segments = cached_blob.get("segment_analytics") if isinstance(cached_blob.get("segment_analytics"), list) else []
            cached_blob["coaching"] = _build_coaching_with_optional_llm(retro_scorecards, retro_segments, retro_base)

            sanitized_cached = recursive_sanitize(cached_blob)
            ride.analysis_blob = sanitized_cached
            ride.analysis_updated_at = datetime.utcnow()
            db.commit()
            return sanitized_cached

        return ride.analysis_blob

    if not ride.telemetry_blob:
        raise HTTPException(status_code=400, detail="No telemetry data")

    df = pd.DataFrame(ride.telemetry_blob)
    
    # --- NEW ANALYTICS ENGINE ---
    from ..analytics.events import detect_acceleration_events, calculate_gear_analytics
    from ..analytics.scoring import calculate_smoothness_score, calculate_efficiency_score, classify_riding_style
    from ..analytics.ml_models import extract_trip_features, cluster_rides

    # Normalize time columns for analytics helpers
    if 'timestamp' not in df.columns and 'timestamp_ms' in df.columns:
        ts = pd.to_numeric(df['timestamp_ms'], errors='coerce')
        df['timestamp'] = pd.to_datetime(ts, unit='ms', errors='coerce')
    elif 'timestamp' in df.columns:
        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')

    # 1. Detection & Scoring
    events = detect_acceleration_events(df)
    gear_stats = calculate_gear_analytics(df)
    smoothness = calculate_smoothness_score(df)
    efficiency = calculate_efficiency_score(df)
    style = classify_riding_style(smoothness, efficiency, len(events))
    segment_analytics = _build_segment_analytics(df)

    consistency_score = 100
    if len(df) > 10 and 'speed_kph' in df.columns:
        speed_mean = float(pd.to_numeric(df['speed_kph'], errors='coerce').fillna(0.0).mean())
        speed_std = float(pd.to_numeric(df['speed_kph'], errors='coerce').fillna(0.0).std())
        if speed_mean > 1:
            consistency_score = int(np.clip(100 - (speed_std / max(speed_mean, 1) * 120), 0, 100))

    risk_index = int(round(np.mean([segment['risk_score_0_100'] for segment in segment_analytics]))) if segment_analytics else 0
    estimated_time_loss = float(sum(segment['time_delta_vs_best_s'] for segment in segment_analytics)) if segment_analytics else 0.0

    scorecards = {
        'smoothness_score': int(smoothness),
        'efficiency_score': int(efficiency),
        'consistency_score': int(consistency_score),
        'risk_index': int(risk_index),
        'estimated_time_loss_s': estimated_time_loss,
    }
    base_coaching = _build_coaching(scorecards, segment_analytics)
    coaching = _build_coaching_with_optional_llm(scorecards, segment_analytics, base_coaching)
    
    # 2. ML Clustering Mock
    trip_features = extract_trip_features(df)
    # Simulate finding cluster relative to historical data (just returning index here for demonstration)
    cluster_idx = cluster_rides([trip_features, trip_features, trip_features])[0]

    # 3. Speed Gradient Map Logic
    segments = []
    
    # Ensure speed_kph exists for map generation even if missing
    if 'lat' in df and 'lng' in df:
        # Force numeric types, coercing errors to NaN
        df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
        df['lng'] = pd.to_numeric(df['lng'], errors='coerce')
        
        if 'speed_kph' not in df:
            df['speed_kph'] = 0.0
        else:
            df['speed_kph'] = pd.to_numeric(df['speed_kph'], errors='coerce').fillna(0.0)
            
    if 'lat' in df and 'lng' in df and 'speed_kph' in df:
        # Drop rows with NaN in critical columns for map
        map_df = df.dropna(subset=['lat', 'lng', 'speed_kph'])
        
        if not map_df.empty:
            max_s = map_df['speed_kph'].max()
            if np.isnan(max_s) or max_s == 0: max_s = 100
            
            # Reset index to allow valid iteration
            map_df = map_df.reset_index(drop=True)
            map_edge_count = max(1, len(map_df) - 1)
            segment_count = max(1, len(segment_analytics))
            edges_per_segment = max(1, int(np.ceil(map_edge_count / segment_count)))
            
            for i in range(len(map_df) - 1):
                p1 = map_df.iloc[i]
                p2 = map_df.iloc[i+1]
                avg_s = (p1['speed_kph'] + p2['speed_kph']) / 2
                segment_index = min(segment_count - 1, i // edges_per_segment)
                segment_meta = segment_analytics[segment_index] if segment_analytics else None
                
                hue = max(0, 120 - (avg_s / max_s * 120))
                if np.isnan(hue): hue = 0
                color = f"hsl({int(hue)}, 100%, 50%)"
                
                segments.append({
                    "start": [p1['lat'], p1['lng']],
                    "end": [p2['lat'], p2['lng']],
                    "color": color,
                    "speed": avg_s,
                    "segment_id": segment_meta.get('segment_id') if segment_meta else None,
                    "time_delta_vs_best_s": segment_meta.get('time_delta_vs_best_s') if segment_meta else None,
                    "risk_score_0_100": segment_meta.get('risk_score_0_100') if segment_meta else None
                })

    # Recursive Sanitize helper for JSON compliance
    def recursive_sanitize(obj):
        if isinstance(obj, dict):
            return {k: recursive_sanitize(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [recursive_sanitize(v) for v in obj]
        elif isinstance(obj, (float, np.floating)):
            if np.isnan(obj) or np.isinf(obj):
                return 0.0
            return float(obj)
        elif isinstance(obj, (int, np.integer)):
            return int(obj)
        return obj

    response_data = {
        "max_speed": ride.max_speed,
        "map_segments": segments,
        "metrics": {
            "smoothness_score": smoothness,
            "efficiency_score": efficiency,
            "riding_style": style,
            "ml_cluster_id": cluster_idx,
            "gear_analytics": gear_stats,
        },
        "events": events,
        "scorecards": scorecards,
        "segment_analytics": segment_analytics,
        "coaching": coaching,
        "summary": "Analysis complete"
    }

    sanitized = recursive_sanitize(response_data)
    ride.analysis_blob = sanitized
    ride.analysis_updated_at = datetime.utcnow()
    db.commit()

    return sanitized

@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ride(ride_id: str, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this ride")
    
    db.delete(ride)
    db.commit()
    return None


from pydantic import BaseModel
class RideUpdateSchema(BaseModel):
    title: Optional[str] = None
    bike_id: Optional[int] = None

@router.put("/{ride_id}", response_model=RideSummary)
def update_ride(ride_id: str, update_data: RideUpdateSchema, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this ride")

    update_fields = update_data.dict(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    if "title" in update_fields:
        title_value = (update_fields.get("title") or "").strip()
        if not title_value:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        ride.title = title_value

    if "bike_id" in update_fields:
        bike_id = update_fields.get("bike_id")
        if bike_id is None:
            ride.bike_id = None
        else:
            bike = db.query(models.Bike).filter(
                models.Bike.id == bike_id,
                models.Bike.owner_id == current_user.id,
            ).first()
            if not bike:
                raise HTTPException(status_code=404, detail="Bike not found")
            ride.bike_id = bike.id

    db.commit()
    db.refresh(ride)
    _decorate_ride_response(ride)
    return ride


@router.get("/llm/providers", response_model=LlmProvidersResponse)
def list_llm_providers(current_user: User = Depends(auth.get_current_user)):
    registry = _load_llm_provider_registry()
    return _build_public_provider_catalog(registry)

@router.post("/{ride_id}/chat", response_model=ChatResponse)
def chat_with_telemetry(ride_id: str, payload: ChatRequest, db: Session = Depends(database.get_db), current_user: User = Depends(auth.get_current_user)):
    tools_used = [
        "Telemetry Window Selector",
        "Signal Normalizer",
        "Ride Signal Analyzer",
        "Track Professional Insight Engine",
        "AI Insight Generator",
    ]
    progress_updates = [
        "Selected telemetry range from your brush window",
        "Validated and normalized telemetry signals",
        "Prepared speed, RPM, throttle, and gear context",
        "Computed racecraft and pro-level insight pack",
    ]

    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    if ride.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this ride")
        
    if not ride.telemetry_blob:
         raise HTTPException(status_code=400, detail="No telemetry data available to analyze")

    registry = _load_llm_provider_registry()
    selected_provider = _resolve_selected_provider(registry, payload.llm_provider, payload.llm_model, payload.api_key)
    selected_provider_id = str(selected_provider.get("id") or "gemini-default")
    selected_model_name = str(selected_provider.get("resolved_model") or selected_provider.get("default_model") or "")

    tools_used.append(f"LLM Provider: {selected_provider_id}")
    progress_updates.append(f"Using model: {selected_model_name}")

    # Filter telemetry to requested time range
    df = pd.DataFrame(ride.telemetry_blob)
    
    # Optional logic to drop non-useful columns to save tokens
    keep_cols = ['timestamp_ms', 'speed_kph', 'rpm', 'throttle', 'calculated_gear', 'gear', 'coolant_temp_c']
    for col in df.columns:
        if col not in keep_cols:
            df = df.drop(columns=[col])
            
    # Filter by time range
    sliced_df = df[(df['timestamp_ms'] >= payload.start_time_ms) & (df['timestamp_ms'] <= payload.end_time_ms)]
    
    if sliced_df.empty:
        return ChatResponse(
            answer="I couldn't find any telemetry data in that specific time range to analyze.",
            tools_used=tools_used,
            progress_updates=progress_updates,
        )

    # Normalize and stabilize timing + gear signals before sending context to the model
    sliced_df = sliced_df.copy()
    sliced_df['timestamp_ms'] = pd.to_numeric(sliced_df['timestamp_ms'], errors='coerce')
    sliced_df = sliced_df.dropna(subset=['timestamp_ms'])
    if sliced_df.empty:
        return ChatResponse(
            answer="I couldn't parse valid timestamps in that selected time range.",
            tools_used=tools_used,
            progress_updates=progress_updates,
        )

    # Ensure chronological order so elapsed timing is always increasing
    sliced_df = sliced_df.sort_values('timestamp_ms', ascending=True).reset_index(drop=True)

    # Normalize numeric channels used in interpretation
    for metric_col in ['speed_kph', 'rpm', 'throttle', 'calculated_gear', 'gear', 'coolant_temp_c']:
        if metric_col in sliced_df.columns:
            sliced_df[metric_col] = pd.to_numeric(sliced_df[metric_col], errors='coerce')

    start_ts = float(sliced_df['timestamp_ms'].iloc[0])
    sliced_df['elapsed_s'] = ((sliced_df['timestamp_ms'] - start_ts) / 1000.0).clip(lower=0.0)

    def _fmt_elapsed_hms(seconds: float) -> str:
        s = max(0, int(seconds))
        h = s // 3600
        m = (s % 3600) // 60
        sec = s % 60
        return f"+{h:02d}:{m:02d}:{sec:02d}"

    sliced_df['elapsed_hms'] = sliced_df['elapsed_s'].apply(_fmt_elapsed_hms)

    # Prefer provided 'gear' if present; fallback to calculated_gear, then smooth transient glitches
    if 'gear' in sliced_df.columns:
        gear_source = sliced_df['gear'].copy()
    elif 'calculated_gear' in sliced_df.columns:
        gear_source = sliced_df['calculated_gear'].copy()
    else:
        gear_source = pd.Series([np.nan] * len(sliced_df))

    # Rolling median smoothing removes single-frame gear spikes (e.g., brief 2->1 blips)
    sliced_df['gear_stable'] = (
        gear_source
        .rolling(window=7, center=True, min_periods=1)
        .median()
        .round()
    )
        
    # Convert sliced subset to a concise CSV string with stable timing + gear context
    # Prune redundant columns to save tokens
    context_cols = [
        col for col in [
            'elapsed_hms', 'speed_kph', 'rpm', 'throttle',
            'gear_stable', 'coolant_temp_c'
        ] if col in sliced_df.columns
    ]
    
    llm_df_context = sliced_df[context_cols].copy()
    
    # Round to reduce characters (e.g. 12.3456789 -> 12.3)
    if 'speed_kph' in llm_df_context.columns:
        llm_df_context['speed_kph'] = llm_df_context['speed_kph'].round(1)
    if 'rpm' in llm_df_context.columns:
        llm_df_context['rpm'] = llm_df_context['rpm'].round(0).astype('Int64')
    if 'throttle' in llm_df_context.columns:
        llm_df_context['throttle'] = llm_df_context['throttle'].round(0).astype('Int64')
    if 'coolant_temp_c' in llm_df_context.columns:
        llm_df_context['coolant_temp_c'] = llm_df_context['coolant_temp_c'].round(0).astype('Int64')

    # If still too large, use time-binning instead of blind slicing
    if len(llm_df_context) > 300:
        # We group by chunks to preserve averages rather than dropping points
        chunk_size = max(1, len(llm_df_context) // 300)
        llm_df_context['chunk_id'] = np.arange(len(llm_df_context)) // chunk_size
        
        # Define aggregations cleanly
        agg_map = {}
        if 'elapsed_hms' in llm_df_context.columns:
            agg_map['elapsed_hms'] = 'first' # Use start time of the chunk
        if 'speed_kph' in llm_df_context.columns:
            agg_map['speed_kph'] = 'mean'
        if 'rpm' in llm_df_context.columns:
            agg_map['rpm'] = 'mean'
        if 'throttle' in llm_df_context.columns:
            agg_map['throttle'] = 'mean'
        if 'gear_stable' in llm_df_context.columns:
            agg_map['gear_stable'] = 'median'
        if 'coolant_temp_c' in llm_df_context.columns:
            agg_map['coolant_temp_c'] = 'mean'
            
        llm_df_context = llm_df_context.groupby('chunk_id').agg(agg_map).reset_index(drop=True)
        
        # Round again after aggregation
        if 'speed_kph' in llm_df_context.columns:
            llm_df_context['speed_kph'] = llm_df_context['speed_kph'].round(1)
        if 'rpm' in llm_df_context.columns:
            llm_df_context['rpm'] = llm_df_context['rpm'].round(0).astype('Int64')
        if 'throttle' in llm_df_context.columns:
            llm_df_context['throttle'] = llm_df_context['throttle'].round(0).astype('Int64')
            
    csv_context = llm_df_context.to_csv(index=False)

    from ..analytics.scoring import calculate_smoothness_score, calculate_efficiency_score
    segment_analytics = _build_segment_analytics(sliced_df)
    smoothness_score = int(calculate_smoothness_score(sliced_df))
    efficiency_score = int(calculate_efficiency_score(sliced_df))
    consistency_score = 100
    if len(sliced_df) > 10 and 'speed_kph' in sliced_df.columns:
        speed_mean = float(pd.to_numeric(sliced_df['speed_kph'], errors='coerce').fillna(0.0).mean())
        speed_std = float(pd.to_numeric(sliced_df['speed_kph'], errors='coerce').fillna(0.0).std())
        if speed_mean > 1:
            consistency_score = int(np.clip(100 - (speed_std / max(speed_mean, 1) * 120), 0, 100))

    risk_index = int(round(np.mean([segment.get('risk_score_0_100', 0) for segment in segment_analytics]))) if segment_analytics else 0
    estimated_time_loss = float(sum(segment.get('time_delta_vs_best_s', 0.0) for segment in segment_analytics)) if segment_analytics else 0.0
    scorecards = {
        'smoothness_score': smoothness_score,
        'efficiency_score': efficiency_score,
        'consistency_score': consistency_score,
        'risk_index': risk_index,
        'estimated_time_loss_s': round(estimated_time_loss, 3),
    }
    pro_insight_pack = _build_professional_insight_pack_for_chat(
        sliced_df=sliced_df,
        scorecards=scorecards,
        segment_analytics=segment_analytics,
    )
    pro_insight_context = _build_user_friendly_insight_context_for_prompt(pro_insight_pack)

    history_max_messages = _env_int("TELEMETRY_HISTORY_MAX_MESSAGES", default=12, minimum=0, maximum=30)
    history_max_chars_per_message = _env_int("TELEMETRY_HISTORY_MAX_CHARS_PER_MESSAGE", default=900, minimum=120, maximum=3000)
    history_max_total_chars = _env_int("TELEMETRY_HISTORY_MAX_TOTAL_CHARS", default=8000, minimum=800, maximum=24000)

    normalized_history = _normalize_chat_history_for_prompt(
        history=payload.history,
        max_messages=history_max_messages,
        max_chars_per_message=history_max_chars_per_message,
        max_total_chars=history_max_total_chars,
    )
    history_context = _build_chat_history_context(normalized_history)

    if normalized_history:
        tools_used.append("Conversation Context Manager")
        progress_updates.append(f"Loaded {len(normalized_history)} prior turns for context")
    else:
        progress_updates.append("No prior conversation context provided")

    try:
        generate_text = lambda prompt_text: _generate_text_with_provider(selected_provider, prompt_text)

        mcp_enabled = _env_bool("TELEMETRY_MCP_TOOL_CALLING_ENABLED", True)
        mcp_max_calls = _env_int("TELEMETRY_MCP_MAX_TOOL_CALLS", default=3, minimum=1, maximum=6)
        mcp_context = ""

        if mcp_enabled:
            mcp_result = _run_mcp_tool_calling_for_chat(
                generate_text=generate_text,
                ride_id=ride_id,
                user_question=payload.prompt,
                max_calls=mcp_max_calls,
            )
            tools_used.extend(mcp_result.get("tools_used") or [])
            progress_updates.extend(mcp_result.get("progress_updates") or [])
            mcp_context = str(mcp_result.get("context") or "").strip()
        else:
            progress_updates.append("MCP tool calling disabled by configuration")

        # Construct prompt
        role_intro = payload.system_prompt.strip() if payload.system_prompt else "You are an expert motorcycle racing mechanic and data analyst for Raptor telemetry systems."
        
        system_prompt = f"""
{role_intro}
The user has selected a specific slice of time from their ride and has a question.

Here is the raw telemetry data for the exact slice of time they investigated (in CSV format):
{csv_context}

Here is a computed professional racecraft summary for the same slice:
{pro_insight_context}

Additional MCP tool outputs (if required for this question):
{mcp_context or "No additional MCP function output was required for this query."}

Conversation context from prior turns (for continuity):
{history_context or "No prior turns supplied for this request."}

User's Question: {payload.prompt}

Please analyze the data slice above and provide a concise, expert answer to their question.
Critical rules for correctness:
1) Use only elapsed_s / elapsed_hms for timing references (do NOT infer timing from raw epoch fields).
2) For gear interpretation, prioritize gear_stable.
3) Treat brief single-sample deviations in calculated_gear as potential noise unless sustained.
4) If data is ambiguous, explicitly say so instead of making a hard claim.
5) Never output raw milliseconds timestamps (no "ms" values like 1772005806742); always reference time as elapsed_hms (e.g., +00:00:17).
6) Use the professional insight pack and MCP output as first-class context in a race-engineer style.
7) When suggesting improvements, prioritize the highest-impact drills first and include specific measurable targets.
8) Never use developer/internal field names in your reply (for example snake_case keys). Use rider-friendly wording instead.
9) Use conversation history for continuity, but prioritize this latest question and current telemetry slice if there is any conflict.
Format your answer with markdown if helpful. Keep it concise but analytical.
"""

        low_quota_mode = bool(payload.low_quota_mode)
        if low_quota_mode:
            progress_updates.append("Low-Quota Mode enabled: skipping multi-pass reasoning")

        reasoning_enabled = (
            (not low_quota_mode)
            and _env_bool("TELEMETRY_REASONING_ENABLED", True)
            and bool(selected_provider.get("reasoning_supported", True))
        )
        reasoning_rounds = _env_int("TELEMETRY_REASONING_MAX_ROUNDS", default=1, minimum=1, maximum=4)

        if reasoning_enabled:
            tools_used.extend([
                "Reasoning Planner",
                "Reasoning Critic/Refiner",
            ])
            progress_updates.append("Generated first-pass analytical answer")

            try:
                reasoning_result = _run_iterative_reasoning_for_chat(
                    generate_text=generate_text,
                    base_prompt=system_prompt,
                    telemetry_csv_context=csv_context,
                    professional_context=pro_insight_context,
                    user_question=payload.prompt,
                    max_rounds=reasoning_rounds,
                )
                rounds_completed = int(reasoning_result.get("rounds_completed", 0) or 0)
                for index in range(rounds_completed):
                    progress_updates.append(f"Ran self-critique and refinement pass {index + 1}")
                progress_updates.append("Finalized corrected response after reasoning checks")
                answer_text = str(reasoning_result.get("answer", "") or "")
                if not answer_text.strip():
                    answer_text = _sanitize_model_answer_for_riders(generate_text(system_prompt))
                    answer_text = _replace_raw_epoch_timestamps(answer_text)
                    progress_updates.append("Reasoning output was empty; used single-pass fallback")
            except HTTPException:
                raise
            except Exception as reasoning_exc:
                progress_updates.append("Reasoning pass fallback activated")
                answer_text = _sanitize_model_answer_for_riders(generate_text(system_prompt))
                answer_text = _replace_raw_epoch_timestamps(answer_text)
                progress_updates.append(f"Reasoning fallback reason: {str(reasoning_exc)[:80]}")
                progress_updates.append("Generated coaching response with AI model")
        else:
            answer_text = _sanitize_model_answer_for_riders(generate_text(system_prompt))
            answer_text = _replace_raw_epoch_timestamps(answer_text)
            progress_updates.append("Generated coaching response with AI model")

        return ChatResponse(
            answer=answer_text,
            tools_used=tools_used,
            progress_updates=progress_updates,
        )
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"DEBUG: LLM API Error: {str(e)}")
        _raise_llm_http_error(selected_provider, selected_model_name, status_code=502, raw_error=str(e))

