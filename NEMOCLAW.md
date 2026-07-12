# NemoClaw Sandbox Integration

NemoClaw provides a lightweight security boundary around every task dispatched to a fleet VM. It wraps the dispatch pipeline with pre-flight sanitization and post-flight auditing without modifying the core hai session flow.

## Architecture

```
User submits task
  → Dispatcher._launch()
    → NemoClaw.pre_flight_check()    # sanitize prompt, stamp sandbox manifest
    → hai create_session()            # normal dispatch
    → NemoClaw.post_flight_audit()   # scan agent actions for violations
  → Verify / finish
```

## Pre-flight: Prompt Sanitization

Before a prompt is sent to the agent, NemoClaw scans it for:

- API keys, secrets, tokens (pattern-matched)
- Bearer tokens
- Private key blocks

Sensitive patterns are replaced with `[REDACTED]`. A `SandboxManifest` is created per task with:
- `sandbox_id` — deterministic hash (task ID + timestamp)
- `allowed_paths` — filesystem paths the agent is permitted to write to
- `sanitized` — whether the prompt was modified
- `violations` — list of any pre-flight findings

## Post-flight: Action Audit

After the session settles, NemoClaw scans every tool-use event for:

1. **File writes outside allowed paths** — `/tmp/`, `/home/agent/`, `/opt/agent/` are allowed; anything else is flagged
2. **Flagged shell commands** — `curl`, `wget`, `scp`, `ssh`, `sudo`, `chmod 777`, etc. are recorded (not blocked)
3. **Sensitive data in agent output** — checks agent text responses for leaked credentials

The audit produces a summary with `clean: true/false` and a list of violations, which is emitted as a status feed event visible in the UI.

## Modes

| Mode | Env Var | Behavior |
|---|---|---|
| **Passive** (default) | `NEMOCLAW_ACTIVE` unset | Logs and stamps manifests, never blocks. Existing flow is unchanged. |
| **Active** | `NEMOCLAW_ACTIVE=true` | Enforces sanitization (modifies prompts) and surfaces violations as warnings. |

## UI

When active, a green **NemoClaw** badge appears in the sidebar next to the Workfleet logo, indicating the sandbox is enforcing policy.

## Files

- `web/backend/app/nemoclaw.py` — `NemoClawSandbox` class, `SandboxManifest` dataclass, singleton `nemoclaw`
- `web/backend/app/dispatcher.py` — pre-flight hook in `_launch()`, post-flight audit in `_watch()`
- `web/backend/app/config.py` — `nemoclaw_active` setting
- `web/frontend/src/components/Sidebar.tsx` — green badge when active
- `web/frontend/src/hooks/useFleet.ts` — `nemoclawActive` state from `/api/config`
