from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from logging.handlers import RotatingFileHandler
import re
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from mcp.server.fastmcp import FastMCP

from app import models
from app.analytics.events import calculate_gear_analytics, detect_acceleration_events
from app.analytics.ml_models import cluster_rides, extract_trip_features
from app.analytics.scoring import (
    calculate_efficiency_score,
    calculate_smoothness_score,
    classify_riding_style,
)
from app.database import SessionLocal
from app.routers.rides import _build_coaching, _build_segment_analytics, compute_duration_seconds


mcp = FastMCP("pulsecraft-internal-analytics")


_TOKEN_STORE_CACHE: Optional[Dict[str, Dict[str, Any]]] = None
_AUDIT_LOGGER: Optional[logging.Logger] = None


def _is_auth_required() -> bool:
    return os.getenv("MCP_AUTH_REQUIRED", "true").strip().lower() not in {"0", "false", "no", "off"}


def _load_token_store() -> Dict[str, Dict[str, Any]]:
    global _TOKEN_STORE_CACHE
    if _TOKEN_STORE_CACHE is not None:
        return _TOKEN_STORE_CACHE

    store: Dict[str, Dict[str, Any]] = {}
    tokens_json = os.getenv("MCP_AUTH_TOKENS_JSON", "").strip()
    if tokens_json:
        try:
            parsed = json.loads(tokens_json)
            if isinstance(parsed, dict):
                for token, payload in parsed.items():
                    if isinstance(payload, dict):
                        scopes = payload.get("scopes") or []
                        if isinstance(scopes, list):
                            store[str(token)] = {
                                "subject": str(payload.get("subject") or payload.get("label") or "token-user"),
                                "scopes": [str(scope) for scope in scopes],
                            }
        except Exception:
            store = {}

    single_token = os.getenv("MCP_AUTH_TOKEN", "").strip()
    if single_token and single_token not in store:
        store[single_token] = {
            "subject": os.getenv("MCP_AUTH_SUBJECT", "single-token"),
            "scopes": ["*", "admin"],
        }

    _TOKEN_STORE_CACHE = store
    return store


def _scope_allowed(scopes: List[str], required_scope: str) -> bool:
    if not required_scope:
        return True
    normalized = {str(scope).strip() for scope in scopes}
    return "*" in normalized or "admin" in normalized or required_scope in normalized


def _get_audit_logger() -> logging.Logger:
    global _AUDIT_LOGGER
    if _AUDIT_LOGGER is not None:
        return _AUDIT_LOGGER

    logger = logging.getLogger("pulsecraft_mcp_audit")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        path = os.getenv("MCP_AUDIT_LOG_PATH", "./mcp_audit.log")
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        handler = RotatingFileHandler(path, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    _AUDIT_LOGGER = logger
    return logger


def _audit_event(
    tool_name: str,
    status: str,
    required_scope: str,
    auth_subject: str,
    details: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    payload = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "tool": tool_name,
        "status": status,
        "required_scope": required_scope,
        "subject": auth_subject,
        "details": details or {},
    }
    if error:
        payload["error"] = error
    _get_audit_logger().info(json.dumps(payload, ensure_ascii=False))


def _authorize_tool(tool_name: str, required_scope: str, auth_token: Optional[str]) -> Dict[str, Any]:
    if not _is_auth_required():
        return {"subject": "auth-disabled", "scopes": ["*"], "token_id": "disabled"}

    token_store = _load_token_store()
    if not token_store:
        raise PermissionError("MCP auth is enabled but no tokens are configured")

    token_value = (auth_token or "").strip()
    if not token_value:
        raise PermissionError(f"Missing auth_token for tool '{tool_name}'")

    token_payload = token_store.get(token_value)
    if not token_payload:
        raise PermissionError("Invalid auth_token")

    scopes = token_payload.get("scopes") or []
    if not _scope_allowed(scopes, required_scope):
        raise PermissionError(f"Token does not grant required scope '{required_scope}'")

    return {
        "subject": str(token_payload.get("subject") or "token-user"),
        "scopes": [str(scope) for scope in scopes],
        "token_id": token_value[:4] + "..." if len(token_value) > 4 else token_value,
    }


def _run_tool(
    tool_name: str,
    required_scope: str,
    auth_token: Optional[str],
    details: Optional[Dict[str, Any]],
    fn,
):
    auth_context = {"subject": "unknown"}
    try:
        auth_context = _authorize_tool(tool_name, required_scope, auth_token)
        result = fn()
        _audit_event(
            tool_name=tool_name,
            status="success",
            required_scope=required_scope,
            auth_subject=auth_context["subject"],
            details=details,
        )
        return result
    except Exception as exc:
        _audit_event(
            tool_name=tool_name,
            status="error",
            required_scope=required_scope,
            auth_subject=auth_context.get("subject", "unknown"),
            details=details,
            error=str(exc),
        )
        raise


def _prepare_dataframe(frames: List[Dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(frames or [])
    if df.empty:
        return df

    df.columns = [str(column).lower().strip() for column in df.columns]
    column_map = {
        "speed": "speed_kph",
        "speed_kmph": "speed_kph",
        "vehicle_speed": "speed_kph",
        "vehicle_speed_kph": "speed_kph",
        "engine_rpm": "rpm",
        "latitude": "lat",
        "longitude": "lng",
        "throttle": "throttle_percent",
    }
    df.rename(columns=column_map, inplace=True)
    df = df.loc[:, ~df.columns.duplicated()]

    for numeric_col in [
        "speed_kph",
        "rpm",
        "throttle_percent",
        "lean_angle",
        "lat",
        "lng",
        "calculated_gear",
        "coolant_temp_c",
        "timestamp_ms",
    ]:
        if numeric_col in df.columns:
            df[numeric_col] = pd.to_numeric(df[numeric_col], errors="coerce")

    if "timestamp" not in df.columns and "timestamp_ms" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp_ms"], unit="ms", errors="coerce")
    elif "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    return df


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000.0
    lat1_rad, lng1_rad = np.radians(lat1), np.radians(lng1)
    lat2_rad, lng2_rad = np.radians(lat2), np.radians(lng2)
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlng / 2.0) ** 2
    return float(2.0 * radius * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a)))


def _compute_distance_km(df: pd.DataFrame) -> float:
    if df.empty or "lat" not in df.columns or "lng" not in df.columns:
        return 0.0

    gps = df[["lat", "lng"]].dropna().reset_index(drop=True)
    if len(gps) < 2:
        return 0.0

    total_m = 0.0
    for index in range(len(gps) - 1):
        point_a = gps.iloc[index]
        point_b = gps.iloc[index + 1]
        total_m += _haversine_m(point_a["lat"], point_a["lng"], point_b["lat"], point_b["lng"])

    return round(total_m / 1000.0, 3)


def _build_scorecards(df: pd.DataFrame, events: List[Dict[str, Any]], segment_analytics: List[Dict[str, Any]]) -> Dict[str, Any]:
    smoothness = calculate_smoothness_score(df)
    efficiency = calculate_efficiency_score(df)

    consistency_score = 100
    if len(df) > 10 and "speed_kph" in df.columns:
        speed_series = pd.to_numeric(df["speed_kph"], errors="coerce").fillna(0.0)
        speed_mean = float(speed_series.mean())
        speed_std = float(speed_series.std())
        if speed_mean > 1:
            consistency_score = int(np.clip(100 - (speed_std / max(speed_mean, 1) * 120), 0, 100))

    risk_index = int(round(np.mean([segment["risk_score_0_100"] for segment in segment_analytics]))) if segment_analytics else 0
    estimated_time_loss = float(sum(segment.get("time_delta_vs_best_s", 0.0) for segment in segment_analytics))

    return {
        "smoothness_score": int(smoothness),
        "efficiency_score": int(efficiency),
        "consistency_score": int(consistency_score),
        "risk_index": int(risk_index),
        "estimated_time_loss_s": float(round(estimated_time_loss, 3)),
        "riding_style": classify_riding_style(smoothness, efficiency, len(events)),
    }


def _fetch_ride_frames(ride_id: str) -> List[Dict[str, Any]]:
    session = SessionLocal()
    try:
        ride = session.query(models.Ride).filter(models.Ride.id == ride_id).first()
        if not ride:
            raise ValueError(f"Ride '{ride_id}' not found")
        return ride.telemetry_blob or []
    finally:
        session.close()


def _run_full_analytics(frames: List[Dict[str, Any]]) -> Dict[str, Any]:
    df = _prepare_dataframe(frames)
    if df.empty:
        return {
            "metrics": {
                "duration_seconds": 0,
                "average_speed_kph": 0.0,
                "max_speed_kph": 0.0,
                "max_rpm": 0,
                "total_distance_km": 0.0,
            },
            "events": [],
            "gear_analytics": [],
            "segment_analytics": [],
            "scorecards": {
                "smoothness_score": 100,
                "efficiency_score": 100,
                "consistency_score": 100,
                "risk_index": 0,
                "estimated_time_loss_s": 0.0,
                "riding_style": "Calm",
            },
            "coaching": _build_coaching({}, []),
            "ml_cluster_id": 0,
            "feature_vector": {"speed_variance": 0.0, "throttle_variance": 0.0, "rpm_variance": 0.0},
        }

    events = detect_acceleration_events(df.copy())
    gear_stats = calculate_gear_analytics(df.copy())
    segment_analytics = _build_segment_analytics(df.copy())
    scorecards = _build_scorecards(df.copy(), events, segment_analytics)
    coaching = _build_coaching(scorecards, segment_analytics)

    features = extract_trip_features(df.copy())
    cluster_id = cluster_rides([features, features, features])[0]

    max_lean_left = 0.0
    max_lean_right = 0.0
    if "lean_angle" in df.columns:
        lean_series = pd.to_numeric(df["lean_angle"], errors="coerce").fillna(0.0)
        max_lean_left = float(round(lean_series.clip(lower=0).max(), 2))
        max_lean_right = float(round(lean_series.clip(upper=0).abs().max(), 2))

    metrics = {
        "duration_seconds": int(compute_duration_seconds(df.copy())),
        "average_speed_kph": float(round(pd.to_numeric(df.get("speed_kph", pd.Series([0]))).fillna(0.0).mean(), 3)),
        "max_speed_kph": float(round(pd.to_numeric(df.get("speed_kph", pd.Series([0]))).fillna(0.0).max(), 3)),
        "max_rpm": int(round(pd.to_numeric(df.get("rpm", pd.Series([0]))).fillna(0.0).max())),
        "total_distance_km": _compute_distance_km(df.copy()),
        "sample_count": int(len(df)),
        "max_lean_left_deg": max_lean_left,
        "max_lean_right_deg": max_lean_right,
    }

    return {
        "metrics": metrics,
        "events": events,
        "gear_analytics": gear_stats,
        "segment_analytics": segment_analytics,
        "scorecards": scorecards,
        "coaching": coaching,
        "ml_cluster_id": int(cluster_id),
        "feature_vector": features,
    }


def _extract_numeric_series(df: pd.DataFrame, columns: List[str]) -> pd.Series:
    for column in columns:
        if column in df.columns:
            return pd.to_numeric(df[column], errors="coerce").fillna(0.0)
    return pd.Series(np.zeros(len(df), dtype=float))


def _extract_gear_series(df: pd.DataFrame) -> pd.Series:
    if "calculated_gear" in df.columns:
        return pd.to_numeric(df["calculated_gear"], errors="coerce")
    if "gear" in df.columns:
        return pd.to_numeric(df["gear"], errors="coerce")
    return pd.Series(np.full(len(df), np.nan))


def _clamp_score(value: float) -> int:
    return int(np.clip(round(value), 0, 100))


def _powerband_report(df: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {
            "under_powerband_pct": 0.0,
            "in_powerband_pct": 0.0,
            "over_rev_pct": 0.0,
            "powerband_efficiency_score": 0,
        }

    rpm = _extract_numeric_series(df, ["rpm", "engine_rpm"])
    under_mask = rpm < 4500
    in_mask = (rpm >= 4500) & (rpm <= 9000)
    over_mask = rpm > 9000

    under_pct = float(round(100.0 * under_mask.mean(), 2))
    in_pct = float(round(100.0 * in_mask.mean(), 2))
    over_pct = float(round(100.0 * over_mask.mean(), 2))
    score = _clamp_score(35 + in_pct - (over_pct * 0.55))

    return {
        "under_powerband_pct": under_pct,
        "in_powerband_pct": in_pct,
        "over_rev_pct": over_pct,
        "powerband_efficiency_score": score,
    }


def _shift_quality_report(df: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {
            "shift_count": 0,
            "upshift_count": 0,
            "downshift_count": 0,
            "late_upshift_count": 0,
            "aggressive_downshift_count": 0,
            "median_shift_rpm": 0,
            "shift_quality_score": 0,
        }

    gear = _extract_gear_series(df)
    rpm = _extract_numeric_series(df, ["rpm", "engine_rpm"])
    speed = _extract_numeric_series(df, ["speed_kph"])

    diffs = gear.diff()
    shift_points = diffs[diffs.notna() & (diffs != 0)]
    shift_indices = shift_points.index.tolist()

    upshift_count = 0
    downshift_count = 0
    late_upshift_count = 0
    aggressive_downshift_count = 0
    shift_rpms: List[float] = []

    for idx in shift_indices:
        delta = float(diffs.iloc[idx])
        prev_rpm = float(rpm.iloc[idx - 1] if idx > 0 else rpm.iloc[idx])
        prev_speed = float(speed.iloc[idx - 1] if idx > 0 else speed.iloc[idx])
        shift_rpms.append(prev_rpm)
        if delta > 0:
            upshift_count += 1
            if prev_rpm > 9500:
                late_upshift_count += 1
        else:
            downshift_count += 1
            if prev_rpm > 7000 and prev_speed > 20:
                aggressive_downshift_count += 1

    shift_count = len(shift_indices)
    median_shift_rpm = int(round(np.median(shift_rpms))) if shift_rpms else 0
    score = _clamp_score(95 - (late_upshift_count * 7) - (aggressive_downshift_count * 6))

    return {
        "shift_count": shift_count,
        "upshift_count": upshift_count,
        "downshift_count": downshift_count,
        "late_upshift_count": late_upshift_count,
        "aggressive_downshift_count": aggressive_downshift_count,
        "median_shift_rpm": median_shift_rpm,
        "shift_quality_score": score,
    }


def _throttle_discipline_report(df: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {
            "maintenance_throttle_pct": 0.0,
            "high_commit_throttle_pct": 0.0,
            "abrupt_throttle_change_pct": 0.0,
            "throttle_discipline_score": 0,
        }

    throttle = _extract_numeric_series(df, ["throttle_percent", "throttle"])
    maintenance_pct = float(round(100.0 * ((throttle > 0) & (throttle < 12)).mean(), 2))
    high_commit_pct = float(round(100.0 * (throttle >= 70).mean(), 2))
    abrupt_pct = float(round(100.0 * (throttle.diff().abs() > 35).mean(), 2))

    score = _clamp_score(82 - (maintenance_pct * 0.35) - (abrupt_pct * 0.4) + (high_commit_pct * 0.16))

    return {
        "maintenance_throttle_pct": maintenance_pct,
        "high_commit_throttle_pct": high_commit_pct,
        "abrupt_throttle_change_pct": abrupt_pct,
        "throttle_discipline_score": score,
    }


def _braking_transition_report(df: pd.DataFrame) -> Dict[str, Any]:
    if df.empty:
        return {
            "hesitation_windows": 0,
            "longest_hesitation_samples": 0,
            "avg_hesitation_samples": 0.0,
            "brake_to_throttle_score": 0,
        }

    speed = _extract_numeric_series(df, ["speed_kph"])
    throttle = _extract_numeric_series(df, ["throttle_percent", "throttle"])
    decel_mask = speed.diff().fillna(0.0) < -1.0
    hesitation_mask = decel_mask & (throttle > 2) & (throttle < 14)

    lengths: List[int] = []
    active = 0
    for is_hesitation in hesitation_mask.tolist():
        if is_hesitation:
            active += 1
        elif active > 0:
            lengths.append(active)
            active = 0
    if active > 0:
        lengths.append(active)

    windows = len(lengths)
    longest = int(max(lengths)) if lengths else 0
    avg_len = float(round(float(np.mean(lengths)), 2)) if lengths else 0.0
    score = _clamp_score(92 - (windows * 6) - (longest * 1.2))

    return {
        "hesitation_windows": windows,
        "longest_hesitation_samples": longest,
        "avg_hesitation_samples": avg_len,
        "brake_to_throttle_score": score,
    }


def _build_track_professional_insights(df: pd.DataFrame, full: Dict[str, Any]) -> Dict[str, Any]:
    powerband = _powerband_report(df)
    shift_quality = _shift_quality_report(df)
    throttle_discipline = _throttle_discipline_report(df)
    braking_transition = _braking_transition_report(df)

    segment_analytics = full.get("segment_analytics", [])
    top_segments = sorted(
        segment_analytics,
        key=lambda seg: float(seg.get("time_delta_vs_best_s", 0.0)),
        reverse=True,
    )[:3]

    priorities: List[Dict[str, Any]] = []

    if shift_quality["late_upshift_count"] > 0:
        priorities.append(
            {
                "theme": "Shift Timing",
                "severity": "high",
                "reason": f"Late upshifts detected {shift_quality['late_upshift_count']} times",
                "drill": "Upshift 500–800 RPM earlier on strong exits and keep revs in usable torque band",
            }
        )

    if throttle_discipline["maintenance_throttle_pct"] > 24:
        priorities.append(
            {
                "theme": "Throttle Commitment",
                "severity": "medium",
                "reason": f"Maintenance throttle is high at {throttle_discipline['maintenance_throttle_pct']}%",
                "drill": "Commit to clearer off-throttle braking or earlier progressive roll-on",
            }
        )

    if braking_transition["hesitation_windows"] > 5:
        priorities.append(
            {
                "theme": "Brake-to-Throttle Transition",
                "severity": "medium",
                "reason": f"Detected {braking_transition['hesitation_windows']} hesitation windows",
                "drill": "Practice one clean brake release followed by a single smooth throttle ramp",
            }
        )

    if powerband["over_rev_pct"] > 12:
        priorities.append(
            {
                "theme": "Powerband Management",
                "severity": "medium",
                "reason": f"Over-rev operation appears in {powerband['over_rev_pct']}% of samples",
                "drill": "Short-shift earlier on traction-limited exits to keep acceleration linear",
            }
        )

    if not priorities:
        priorities.append(
            {
                "theme": "Consistency",
                "severity": "low",
                "reason": "No major anomalies detected from core racecraft signals",
                "drill": "Repeat clean laps and focus on reducing small variability in entries and exits",
            }
        )

    racecraft_score = _clamp_score(
        np.mean(
            [
                powerband["powerband_efficiency_score"],
                shift_quality["shift_quality_score"],
                throttle_discipline["throttle_discipline_score"],
                braking_transition["brake_to_throttle_score"],
            ]
        )
    )

    return {
        "racecraft_score": racecraft_score,
        "powerband_report": powerband,
        "shift_quality_report": shift_quality,
        "throttle_discipline_report": throttle_discipline,
        "braking_transition_report": braking_transition,
        "top_time_loss_segments": top_segments,
        "priority_focus": priorities,
    }


def _build_llm_insight_pack(ride_id: str, full: Dict[str, Any], pro: Dict[str, Any]) -> Dict[str, Any]:
    events = full.get("events", [])
    top_events = events[:12]
    segments = full.get("segment_analytics", [])
    top_segments = sorted(
        segments,
        key=lambda seg: float(seg.get("time_delta_vs_best_s", 0.0)),
        reverse=True,
    )[:5]

    return {
        "ride_id": ride_id,
        "metrics": full.get("metrics", {}),
        "scorecards": full.get("scorecards", {}),
        "racecraft": {
            "racecraft_score": pro.get("racecraft_score", 0),
            "priority_focus": pro.get("priority_focus", []),
        },
        "powerband_report": pro.get("powerband_report", {}),
        "shift_quality_report": pro.get("shift_quality_report", {}),
        "throttle_discipline_report": pro.get("throttle_discipline_report", {}),
        "braking_transition_report": pro.get("braking_transition_report", {}),
        "top_events": top_events,
        "top_segments": top_segments,
        "coaching": full.get("coaching", {}),
    }


_INTENT_RULES: Dict[str, Dict[str, Any]] = {
    "speed_metrics": {
        "keywords": ["speed", "avg", "average", "max speed", "pace", "velocity", "distance"],
        "tool": "get_average_speed",
        "outputs": ["average_speed_kph", "max_speed_kph", "total_distance_km"],
    },
    "duration_metrics": {
        "keywords": ["duration", "time", "long", "ride time", "elapsed"],
        "tool": "get_duration_seconds",
        "outputs": ["duration_seconds"],
    },
    "event_detection": {
        "keywords": ["event", "brake", "braking", "accel", "acceleration", "harsh", "aggressive"],
        "tool": "get_events",
        "outputs": ["events_count", "events"],
    },
    "gear_rpm": {
        "keywords": ["gear", "rpm", "shifting", "rev", "engine"],
        "tool": "get_gear_analytics",
        "outputs": ["gear_analytics"],
    },
    "scores_style": {
        "keywords": ["score", "risk", "style", "efficiency", "smoothness", "consistency"],
        "tool": "get_scorecards",
        "outputs": ["scorecards"],
    },
    "coaching_segments": {
        "keywords": ["coach", "coaching", "segment", "improve", "drill", "weakness", "strength"],
        "tool": "run_full_analysis_for_ride",
        "outputs": ["segment_analytics", "coaching"],
    },
    "professional_racecraft": {
        "keywords": ["professional", "racecraft", "track", "lap", "pro", "strategy", "line", "exit"],
        "tool": "get_track_professional_insights",
        "outputs": ["track_professional_insights", "llm_insight_pack"],
    },
    "drivability": {
        "keywords": ["throttle", "transition", "powerband", "shift quality", "downshift", "upshift"],
        "tool": "get_llm_insight_pack",
        "outputs": [
            "powerband_report",
            "shift_quality_report",
            "throttle_discipline_report",
            "braking_transition_report",
        ],
    },
}


def _tokenize_query(query: str) -> str:
    text = (query or "").lower()
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _classify_query_intents(query: str) -> Dict[str, Any]:
    normalized = _tokenize_query(query)
    intents: Dict[str, Dict[str, Any]] = {}

    for intent_name, rule in _INTENT_RULES.items():
        hits = [keyword for keyword in rule["keywords"] if keyword in normalized]
        if hits:
            score = min(0.98, 0.35 + 0.16 * len(hits))
            intents[intent_name] = {
                "score": round(score, 3),
                "matched_keywords": hits,
                "tool": rule["tool"],
                "outputs": rule["outputs"],
            }

    if not intents:
        intents["overview"] = {
            "score": 0.42,
            "matched_keywords": [],
            "tool": "run_full_analysis_for_ride",
            "outputs": ["metrics", "scorecards", "events_count"],
        }

    return {
        "normalized_query": normalized,
        "intents": intents,
    }


def _build_tool_graph_plan(intent_payload: Dict[str, Any]) -> Dict[str, Any]:
    intents = intent_payload["intents"]

    nodes: List[Dict[str, Any]] = [
        {
            "id": "load_ride_context",
            "tool": "run_full_analysis_for_ride",
            "depends_on": [],
            "provides": ["metrics", "events", "gear_analytics", "scorecards", "segment_analytics", "coaching"],
            "reason": "foundation node for all downstream projections",
        }
    ]

    for intent_name, details in intents.items():
        node_id = f"intent_{intent_name}"
        nodes.append(
            {
                "id": node_id,
                "tool": details["tool"],
                "depends_on": ["load_ride_context"],
                "provides": details["outputs"],
                "reason": f"matched keywords: {', '.join(details['matched_keywords'])}" if details["matched_keywords"] else "default overview route",
                "intent_score": details["score"],
            }
        )

    edges = [{"from": "load_ride_context", "to": node["id"]} for node in nodes if node["id"] != "load_ride_context"]
    selected_tools = list(dict.fromkeys([node["tool"] for node in nodes]))
    execution_order = [node["id"] for node in nodes]

    requested_outputs: List[str] = []
    for intent_data in intents.values():
        for output_key in intent_data["outputs"]:
            if output_key not in requested_outputs:
                requested_outputs.append(output_key)

    return {
        "nodes": nodes,
        "edges": edges,
        "execution_order": execution_order,
        "selected_tools": selected_tools,
        "requested_outputs": requested_outputs,
    }


def _project_answer_from_full(
    full: Dict[str, Any],
    requested_outputs: List[str],
    professional_insights: Optional[Dict[str, Any]] = None,
    llm_insight_pack: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    answer: Dict[str, Any] = {}
    metrics = full.get("metrics", {})
    professional_insights = professional_insights or {}
    llm_insight_pack = llm_insight_pack or {}

    for key in requested_outputs:
        if key == "average_speed_kph":
            answer[key] = metrics.get("average_speed_kph")
        elif key == "max_speed_kph":
            answer[key] = metrics.get("max_speed_kph")
        elif key == "total_distance_km":
            answer[key] = metrics.get("total_distance_km")
        elif key == "duration_seconds":
            answer[key] = metrics.get("duration_seconds")
        elif key == "events_count":
            answer[key] = len(full.get("events", []))
        elif key == "events":
            answer[key] = full.get("events", [])[:20]
        elif key == "gear_analytics":
            answer[key] = full.get("gear_analytics", [])
        elif key == "scorecards":
            answer[key] = full.get("scorecards", {})
        elif key == "segment_analytics":
            answer[key] = full.get("segment_analytics", [])[:8]
        elif key == "coaching":
            answer[key] = full.get("coaching", {})
        elif key == "metrics":
            answer[key] = metrics
        elif key == "powerband_report":
            answer[key] = professional_insights.get("powerband_report", {})
        elif key == "shift_quality_report":
            answer[key] = professional_insights.get("shift_quality_report", {})
        elif key == "throttle_discipline_report":
            answer[key] = professional_insights.get("throttle_discipline_report", {})
        elif key == "braking_transition_report":
            answer[key] = professional_insights.get("braking_transition_report", {})
        elif key == "track_professional_insights":
            answer[key] = professional_insights
        elif key == "llm_insight_pack":
            answer[key] = llm_insight_pack

    if not answer:
        answer = {
            "metrics": metrics,
            "scorecards": full.get("scorecards", {}),
            "events_count": len(full.get("events", [])),
        }

    return answer


@mcp.tool()
def list_internal_tools(auth_token: Optional[str] = None) -> Dict[str, Any]:
    """List project analytics MCP tools and intended usage."""
    return _run_tool(
        tool_name="list_internal_tools",
        required_scope="tools:read",
        auth_token=auth_token,
        details={},
        fn=lambda: {
            "tools": [
                "list_recent_rides",
                "get_average_speed",
                "get_duration_seconds",
                "get_events",
                "get_gear_analytics",
                "get_scorecards",
                "run_full_analysis_for_ride",
                "run_full_analysis_for_frames",
                "thinking_query_for_ride",
                "get_powerband_report",
                "get_shift_quality_report",
                "get_throttle_discipline_report",
                "get_braking_transition_report",
                "get_track_professional_insights",
                "get_llm_insight_pack",
            ],
            "source": "pulsecraft-bike backend analytics",
            "auth_required": _is_auth_required(),
        },
    )


@mcp.tool()
def list_recent_rides(limit: int = 20, auth_token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return recent rides with basic stats for MCP clients."""
    limit = max(1, min(int(limit), 100))

    def _inner() -> List[Dict[str, Any]]:
        session = SessionLocal()
        try:
            rides = session.query(models.Ride).order_by(models.Ride.started_at.desc()).limit(limit).all()
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

    return _run_tool(
        tool_name="list_recent_rides",
        required_scope="ride:read",
        auth_token=auth_token,
        details={"limit": limit},
        fn=_inner,
    )


@mcp.tool()
def get_average_speed(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Compute average speed from ride telemetry using project logic."""
    return _run_tool(
        tool_name="get_average_speed",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=lambda: {
            "ride_id": ride_id,
            "average_speed_kph": _run_full_analytics(_fetch_ride_frames(ride_id))["metrics"]["average_speed_kph"],
            "source_function": "_run_full_analytics -> pandas mean(speed_kph)",
        },
    )


@mcp.tool()
def get_duration_seconds(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Compute ride duration in seconds using compute_duration_seconds."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        df = _prepare_dataframe(frames)
        return {
            "ride_id": ride_id,
            "duration_seconds": int(compute_duration_seconds(df)),
            "source_function": "compute_duration_seconds",
        }

    return _run_tool(
        tool_name="get_duration_seconds",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_events(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Detect hard acceleration and braking events."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        df = _prepare_dataframe(frames)
        events = detect_acceleration_events(df)
        return {
            "ride_id": ride_id,
            "count": len(events),
            "events": events,
            "source_function": "detect_acceleration_events",
        }

    return _run_tool(
        tool_name="get_events",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_gear_analytics(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return gear-time and average RPM analytics."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        df = _prepare_dataframe(frames)
        if "engine_rpm" not in df.columns and "rpm" in df.columns:
            df["engine_rpm"] = df["rpm"]
        data = calculate_gear_analytics(df)
        return {
            "ride_id": ride_id,
            "gear_analytics": data,
            "source_function": "calculate_gear_analytics",
        }

    return _run_tool(
        tool_name="get_gear_analytics",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_scorecards(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return smoothness/efficiency/risk-style scorecards for a ride."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        analytics = _run_full_analytics(frames)
        return {
            "ride_id": ride_id,
            "scorecards": analytics["scorecards"],
            "source_functions": [
                "calculate_smoothness_score",
                "calculate_efficiency_score",
                "classify_riding_style",
                "_build_segment_analytics",
            ],
        }

    return _run_tool(
        tool_name="get_scorecards",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def run_full_analysis_for_ride(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Run full ride analytics stack on one persisted ride."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        result = _run_full_analytics(frames)
        result["ride_id"] = ride_id
        return result

    return _run_tool(
        tool_name="run_full_analysis_for_ride",
        required_scope="analysis:execute",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def run_full_analysis_for_frames(frames: List[Dict[str, Any]], auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Run full ride analytics stack on raw telemetry frames."""
    return _run_tool(
        tool_name="run_full_analysis_for_frames",
        required_scope="analysis:execute",
        auth_token=auth_token,
        details={"frame_count": len(frames or [])},
        fn=lambda: _run_full_analytics(frames),
    )


@mcp.tool()
def get_powerband_report(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return engine powerband usage and efficiency signals for one ride."""
    def _inner() -> Dict[str, Any]:
        df = _prepare_dataframe(_fetch_ride_frames(ride_id))
        return {
            "ride_id": ride_id,
            "powerband_report": _powerband_report(df),
        }

    return _run_tool(
        tool_name="get_powerband_report",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_shift_quality_report(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return shifting quality diagnostics for one ride."""
    def _inner() -> Dict[str, Any]:
        df = _prepare_dataframe(_fetch_ride_frames(ride_id))
        return {
            "ride_id": ride_id,
            "shift_quality_report": _shift_quality_report(df),
        }

    return _run_tool(
        tool_name="get_shift_quality_report",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_throttle_discipline_report(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return throttle discipline metrics for one ride."""
    def _inner() -> Dict[str, Any]:
        df = _prepare_dataframe(_fetch_ride_frames(ride_id))
        return {
            "ride_id": ride_id,
            "throttle_discipline_report": _throttle_discipline_report(df),
        }

    return _run_tool(
        tool_name="get_throttle_discipline_report",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_braking_transition_report(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return braking-to-throttle transition quality metrics for one ride."""
    def _inner() -> Dict[str, Any]:
        df = _prepare_dataframe(_fetch_ride_frames(ride_id))
        return {
            "ride_id": ride_id,
            "braking_transition_report": _braking_transition_report(df),
        }

    return _run_tool(
        tool_name="get_braking_transition_report",
        required_scope="analysis:read",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_track_professional_insights(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return racecraft-focused professional insights and prioritized drills."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        df = _prepare_dataframe(frames)
        full = _run_full_analytics(frames)
        return {
            "ride_id": ride_id,
            "track_professional_insights": _build_track_professional_insights(df, full),
        }

    return _run_tool(
        tool_name="get_track_professional_insights",
        required_scope="analysis:execute",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def get_llm_insight_pack(ride_id: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Return compact LLM-ready insight pack with racecraft, events, segments, and coaching."""
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        df = _prepare_dataframe(frames)
        full = _run_full_analytics(frames)
        pro = _build_track_professional_insights(df, full)
        return _build_llm_insight_pack(ride_id, full, pro)

    return _run_tool(
        tool_name="get_llm_insight_pack",
        required_scope="analysis:execute",
        auth_token=auth_token,
        details={"ride_id": ride_id},
        fn=_inner,
    )


@mcp.tool()
def thinking_query_for_ride(ride_id: str, query: str, auth_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Lightweight thinking/planning tool: maps natural language query to relevant
    internal analytics tools and returns combined answer with lineage.
    """
    def _inner() -> Dict[str, Any]:
        frames = _fetch_ride_frames(ride_id)
        full = _run_full_analytics(frames)
        df = _prepare_dataframe(frames)
        professional_insights = _build_track_professional_insights(df, full)
        llm_pack = _build_llm_insight_pack(ride_id, full, professional_insights)
        intent_payload = _classify_query_intents(query)
        tool_graph = _build_tool_graph_plan(intent_payload)
        answer = _project_answer_from_full(
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
            "lineage": {
                "metrics": "_run_full_analytics",
                "events": "detect_acceleration_events",
                "gear_analytics": "calculate_gear_analytics",
                "scorecards": "calculate_smoothness_score/calculate_efficiency_score/classify_riding_style",
                "segments": "_build_segment_analytics",
                "coaching": "_build_coaching",
                "professional_insights": "_build_track_professional_insights",
                "llm_pack": "_build_llm_insight_pack",
            },
            "confidence": {
                "label": "high" if confidence_score >= 0.7 else "medium",
                "score": confidence_score,
            },
        }

    return _run_tool(
        tool_name="thinking_query_for_ride",
        required_scope="analysis:execute",
        auth_token=auth_token,
        details={"ride_id": ride_id, "query_len": len(query or "")},
        fn=_inner,
    )


if __name__ == "__main__":
    mcp.run()
