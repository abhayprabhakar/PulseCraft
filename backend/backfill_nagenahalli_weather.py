"""Backfill missing ride weather using Open-Meteo historical data.

Usage from the backend directory:
    python backfill_nagenahalli_weather.py --dry-run
    python backfill_nagenahalli_weather.py

The script only updates rides that do not already have both temperature and
humidity values, so it is safe to run more than once.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from sqlalchemy import inspect, text


BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app import database, models  # noqa: E402


LOCATION_NAME = "Nagenahalli, Bengaluru, India"
LOCATION_TIMEZONE = ZoneInfo("Asia/Kolkata")
SOURCE_NAME = "open-meteo-archive:nagenahalli"


def _get_json(base_url: str, params: dict[str, Any]) -> dict[str, Any]:
    url = f"{base_url}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "PulseCraft-weather-backfill/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def _resolve_nagenahalli() -> tuple[float, float]:
    result = _get_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": "Nagenahalli", "count": 10, "language": "en", "format": "json"},
    )
    candidates = result.get("results") or []
    for candidate in candidates:
        if (
            str(candidate.get("country_code", "")).upper() == "IN"
            and "karnataka" in str(candidate.get("admin1", "")).lower()
        ):
            return float(candidate["latitude"]), float(candidate["longitude"])

    raise RuntimeError("Could not resolve Nagenahalli in Karnataka through Open-Meteo")


def _ride_local_time(ride: models.Ride) -> datetime:
    value = ride.ended_at or ride.started_at
    if value.tzinfo is None:
        return value.replace(tzinfo=LOCATION_TIMEZONE)
    return value.astimezone(LOCATION_TIMEZONE)


def _hour_key(value: datetime) -> str:
    return value.astimezone(LOCATION_TIMEZONE).replace(minute=0, second=0, microsecond=0).strftime(
        "%Y-%m-%dT%H:00"
    )


def _fetch_hourly_weather(
    latitude: float,
    longitude: float,
    start_date: datetime,
    end_date: datetime,
) -> dict[str, tuple[float, float]]:
    result = _get_json(
        "https://archive-api.open-meteo.com/v1/archive",
        {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
            "hourly": "temperature_2m,relative_humidity_2m",
            "timezone": "Asia/Kolkata",
        },
    )
    hourly = result.get("hourly") or {}
    times = hourly.get("time") or []
    temperatures = hourly.get("temperature_2m") or []
    humidities = hourly.get("relative_humidity_2m") or []
    values: dict[str, tuple[float, float]] = {}
    for timestamp, temperature, humidity in zip(times, temperatures, humidities):
        if temperature is None or humidity is None:
            continue
        values[str(timestamp)[:13]] = (float(temperature), float(humidity))
    return values


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing to the database")
    parser.add_argument("--limit", type=int, default=0, help="Limit the number of rides considered")
    parser.add_argument("--latitude", type=float, help="Override the geocoded Nagenahalli latitude")
    parser.add_argument("--longitude", type=float, help="Override the geocoded Nagenahalli longitude")
    return parser.parse_args()


def _ensure_weather_columns() -> None:
    inspector = inspect(database.engine)
    if not inspector.has_table("rides"):
        raise RuntimeError("The configured database has no rides table")

    existing = {column["name"] for column in inspector.get_columns("rides")}
    timestamp_type = "TIMESTAMP" if database.engine.dialect.name.startswith("postgres") else "DATETIME"
    statements = {
        "weather_temp_c": "ALTER TABLE rides ADD COLUMN weather_temp_c FLOAT",
        "weather_humidity_pct": "ALTER TABLE rides ADD COLUMN weather_humidity_pct FLOAT",
        "weather_source": "ALTER TABLE rides ADD COLUMN weather_source VARCHAR",
        "weather_observed_at": f"ALTER TABLE rides ADD COLUMN weather_observed_at {timestamp_type}",
        "weather_fetch_status": "ALTER TABLE rides ADD COLUMN weather_fetch_status VARCHAR",
        "weather_fetch_error": "ALTER TABLE rides ADD COLUMN weather_fetch_error VARCHAR",
    }
    for column_name, statement in statements.items():
        if column_name in existing:
            continue
        with database.engine.begin() as connection:
            connection.execute(text(statement))
        existing.add(column_name)


def main() -> int:
    args = _parse_args()
    if (args.latitude is None) != (args.longitude is None):
        raise SystemExit("--latitude and --longitude must be provided together")

    latitude, longitude = (
        (args.latitude, args.longitude)
        if args.latitude is not None
        else _resolve_nagenahalli()
    )
    _ensure_weather_columns()
    db = database.SessionLocal()
    try:
        query = (
            db.query(models.Ride)
            .filter(
                (models.Ride.weather_temp_c.is_(None))
                | (models.Ride.weather_humidity_pct.is_(None))
            )
            .order_by(models.Ride.started_at.asc())
        )
        if args.limit > 0:
            query = query.limit(args.limit)
        rides = query.all()
        if not rides:
            print("No rides are missing complete weather data.")
            return 0

        local_times = [_ride_local_time(ride) for ride in rides]
        weather_by_year: dict[int, dict[str, tuple[float, float]]] = {}
        for year in sorted({value.year for value in local_times}):
            year_times = [value for value in local_times if value.year == year]
            weather_by_year[year] = _fetch_hourly_weather(
                latitude,
                longitude,
                min(year_times),
                max(year_times),
            )

        matched = 0
        for ride, local_time in zip(rides, local_times):
            weather = weather_by_year[local_time.year].get(_hour_key(local_time))
            if weather is None:
                print(f"SKIP {ride.id}: no historical weather for {_hour_key(local_time)}")
                continue

            temperature, humidity = weather
            print(
                f"{'MATCH' if args.dry_run else 'UPDATE'} {ride.id}: "
                f"{local_time.isoformat()} {temperature:.1f}C {humidity:.0f}%"
            )
            matched += 1
            if args.dry_run:
                continue

            ride.weather_temp_c = temperature
            ride.weather_humidity_pct = humidity
            ride.weather_source = SOURCE_NAME
            ride.weather_observed_at = local_time.replace(tzinfo=None)
            ride.weather_fetch_status = "success"
            ride.weather_fetch_error = None

        if args.dry_run:
            print(f"Dry run complete: {matched} rides would be updated.")
        else:
            db.commit()
            print(f"Backfill complete: {matched} rides updated from {LOCATION_NAME}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    main()