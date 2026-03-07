import json
import os
import tempfile
from pathlib import Path


def _build_sample_frames():
    return [
        {
            "timestamp_ms": 1700000000000,
            "speed_kph": 22,
            "rpm": 3000,
            "calculated_gear": 2,
            "lat": 12.9716,
            "lng": 77.5946,
        },
        {
            "timestamp_ms": 1700000001000,
            "speed_kph": 31,
            "rpm": 4200,
            "calculated_gear": 3,
            "lat": 12.9719,
            "lng": 77.5949,
        },
        {
            "timestamp_ms": 1700000002000,
            "speed_kph": 45,
            "rpm": 5100,
            "calculated_gear": 3,
            "lat": 12.9722,
            "lng": 77.5952,
        },
    ]


def main() -> None:
    temp_dir = Path(tempfile.gettempdir())
    audit_path = temp_dir / "pulsecraft_mcp_smoke_audit.log"
    if audit_path.exists():
        audit_path.unlink()

    os.environ["MCP_AUTH_REQUIRED"] = "true"
    os.environ["MCP_AUDIT_LOG_PATH"] = str(audit_path)
    os.environ["MCP_AUTH_TOKENS_JSON"] = json.dumps(
        {
            "smoke-read": {"subject": "smoke-reader", "scopes": ["tools:read", "analysis:read"]},
            "smoke-exec": {
                "subject": "smoke-executor",
                "scopes": ["tools:read", "analysis:read", "analysis:execute"],
            },
        }
    )

    from app import mcp_server

    tools = mcp_server.list_internal_tools(auth_token="smoke-read")
    assert "tools" in tools and "run_full_analysis_for_frames" in tools["tools"]

    denied = False
    try:
        mcp_server.run_full_analysis_for_frames(_build_sample_frames(), auth_token="smoke-read")
    except PermissionError:
        denied = True
    assert denied, "analysis:execute should be denied for read token"

    result = mcp_server.run_full_analysis_for_frames(_build_sample_frames(), auth_token="smoke-exec")
    assert "metrics" in result and "average_speed_kph" in result["metrics"]

    assert audit_path.exists(), "Audit log file was not created"
    content = audit_path.read_text(encoding="utf-8").strip()
    assert content, "Audit log file is empty"

    print("MCP smoke test passed")
    print(f"Audit log: {audit_path}")


if __name__ == "__main__":
    main()
