"""NemoClaw sandbox integration — pre-flight sanitization and post-flight audit.

Wraps every dispatched task with a lightweight security boundary:
  1. pre_flight_check  — sanitize the prompt, validate allowed paths, stamp a
                         sandbox manifest onto the task metadata.
  2. post_flight_audit — inspect the agent's actions for policy violations
                         (file writes outside the workspace, suspicious
                         commands) and produce an audit record.

In passive mode (default) both hooks are no-ops that log and return success,
so the existing dispatch flow is never broken. In active mode
(NEMOCLAW_ACTIVE=true) the hooks enforce the sandbox policy.

Design ref: NEMOCLAW.md
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from .config import settings

logger = logging.getLogger(__name__)

# Patterns that should never appear in a sanitized prompt.
_SENSITIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?i)(api[_-]?key|secret|password|token)\s*[=:]\s*\S+"),
    re.compile(r"(?i)Bearer\s+[A-Za-z0-9\-_]+"),
    re.compile(r"(?i)-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----"),
]

# Filesystem paths the agent is allowed to touch. Anything else is a violation.
_ALLOWED_WRITE_PATHS: tuple[str, ...] = (
    "/tmp/",
    "/home/agent/",
    "/opt/agent/",
)

# Shell commands that are flagged in the audit (not blocked, but recorded).
_FLAGGED_COMMANDS: tuple[str, ...] = (
    "curl", "wget", "scp", "rsync", "nc ", "ncat", "ssh ",
    "chmod 777", "chown", "sudo ", "su ",
)


@dataclass
class SandboxManifest:
    """Per-task sandbox metadata, stamped before dispatch."""

    task_id: str
    sandbox_id: str
    created_at: float
    allowed_paths: list[str] = field(default_factory=list)
    sanitized: bool = False
    violations: list[str] = field(default_factory=list)
    active: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "sandbox_id": self.sandbox_id,
            "created_at": self.created_at,
            "allowed_paths": self.allowed_paths,
            "sanitized": self.sanitized,
            "violations": self.violations,
            "active": self.active,
        }


class NemoClawSandbox:
    """Lightweight sandbox wrapper around the hai dispatch pipeline.

    Usage (from dispatcher):
        manifest = await nemoclaw.pre_flight_check(task_id, prompt)
        # ... run the task ...
        audit = await nemoclaw.post_flight_audit(task_id, manifest, events)
    """

    def __init__(self, active: bool = False) -> None:
        self.active = active
        self._manifests: dict[str, SandboxManifest] = {}

    # -- pre-flight -----------------------------------------------------------

    async def pre_flight_check(
        self, task_id: str, prompt: str
    ) -> SandboxManifest:
        """Sanitize the prompt and create a sandbox manifest for the task.

        Always returns a manifest — in passive mode it's informational only.
        """
        sandbox_id = self._make_sandbox_id(task_id)
        manifest = SandboxManifest(
            task_id=task_id,
            sandbox_id=sandbox_id,
            created_at=time.time(),
            allowed_paths=list(_ALLOWED_WRITE_PATHS),
            active=self.active,
        )

        if self.active:
            sanitized, flagged = self._sanitize_prompt(prompt)
            manifest.sanitized = sanitized != prompt
            if flagged:
                manifest.violations.extend(
                    f"pre-flight: sensitive pattern detected: {f}" for f in flagged
                )
            logger.info(
                "NemoClaw pre-flight for %s: sandbox=%s sanitized=%s violations=%d",
                task_id, sandbox_id, manifest.sanitized, len(manifest.violations),
            )
        else:
            logger.debug("NemoClaw pre-flight (passive) for %s: sandbox=%s", task_id, sandbox_id)

        self._manifests[task_id] = manifest
        return manifest

    # -- post-flight ----------------------------------------------------------

    async def post_flight_audit(
        self,
        task_id: str,
        manifest: SandboxManifest,
        events: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Audit the agent's actions after the task completes.

        Scans tool-use events for file writes outside allowed paths and
        flagged shell commands. Returns an audit summary dict.
        """
        events = events or []
        violations: list[str] = []

        for ev in events:
            tool = ev.get("tool", "")
            args = ev.get("args", {})
            text = ev.get("text", "")

            # Check file writes
            if tool in ("write_file", "run_command"):
                path = args.get("path", "")
                command_parts = args.get("command", [])
                if isinstance(command_parts, list):
                    command_str = " ".join(str(c) for c in command_parts)
                else:
                    command_str = str(command_parts)

                # Path-based check
                if path and not any(path.startswith(p) for p in _ALLOWED_WRITE_PATHS):
                    violations.append(f"write outside sandbox: {path}")

                # Command-based check
                for flagged in _FLAGGED_COMMANDS:
                    if flagged in command_str.lower():
                        violations.append(f"flagged command: {flagged.strip()} in {command_str[:80]}")

            # Check raw text for sensitive data leakage
            if text:
                for pattern in _SENSITIVE_PATTERNS:
                    if pattern.search(text):
                        violations.append("sensitive data in agent output")
                        break

        manifest.violations.extend(violations)

        audit = {
            "sandbox_id": manifest.sandbox_id,
            "task_id": task_id,
            "active": manifest.active,
            "events_scanned": len(events),
            "violations": manifest.violations,
            "clean": len(manifest.violations) == 0,
            "audited_at": time.time(),
        }

        if violations:
            logger.warning(
                "NemoClaw post-flight audit for %s: %d violation(s)",
                task_id, len(violations),
            )
        else:
            logger.info("NemoClaw post-flight audit for %s: clean", task_id)

        return audit

    # -- helpers -------------------------------------------------------------

    def get_manifest(self, task_id: str) -> SandboxManifest | None:
        return self._manifests.get(task_id)

    def _sanitize_prompt(self, prompt: str) -> tuple[str, list[str]]:
        """Strip sensitive patterns from the prompt.

        Returns (sanitized_prompt, list_of_flagged_patterns).
        """
        flagged: list[str] = []
        sanitized = prompt
        for pattern in _SENSITIVE_PATTERNS:
            matches = pattern.findall(sanitized)
            if matches:
                flagged.append(pattern.pattern[:60])
                sanitized = pattern.sub("[REDACTED]", sanitized)
        return sanitized, flagged

    @staticmethod
    def _make_sandbox_id(task_id: str) -> str:
        """Deterministic sandbox ID from task ID + timestamp."""
        raw = f"{task_id}:{time.time()}"
        return "nc-" + hashlib.sha256(raw.encode()).hexdigest()[:12]


# Singleton — passive by default. Set NEMOCLAW_ACTIVE=true to enable enforcement.
nemoclaw = NemoClawSandbox(
    active=settings.nemoclaw_active,
)
