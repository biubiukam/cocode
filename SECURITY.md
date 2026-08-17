# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Email **security@cocode.agency** with:

- what the vulnerability allows an attacker to do,
- the affected component and version (`cocode-gui`, `cocode-tui`, or
  `cocode-host-supervisor`),
- steps to reproduce, ideally with a minimal proof of concept,
- your operating system and Node.js version.

You will get an acknowledgement within 3 business days and an assessment with a
remediation plan within 10 business days. We will keep you updated as the fix
progresses and will credit you in the release notes unless you prefer otherwise.

Please give us reasonable time to ship a fix before disclosing publicly.

## Supported versions

Cocode is pre-release. Security fixes land on `main` and ship in the next
release; there are no maintained backport branches yet.

## Scope

In scope:

- Sandbox or approval-gate bypasses that let the agent write files, run
  commands, or reach the network without user confirmation.
- Credential exposure — API keys or identity tokens leaking into session logs,
  telemetry, crash reports, or world-readable files.
- Electron hardening failures: context isolation bypass, unsafe `nodeIntegration`
  exposure, or a preload bridge that hands the renderer more than its
  allow-listed capability.
- Privilege escalation through the Supervisor IPC or lease protocol, including
  one local user attaching to another user's Host.
- Path traversal through session IDs, workspace paths, or attachment handling.
- Remote code execution through untrusted model output, tool results, or
  attachments.

Out of scope:

- Vulnerabilities in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
  itself. Report those upstream. If a Cocode default configuration turns an
  upstream weakness into an exploitable issue, that is in scope here.
- The agent doing something destructive that you explicitly approved. The
  approval gate is the boundary; bypassing it is a vulnerability, honoring it is
  not.
- Findings that require an already-compromised local machine or a malicious
  operating system account with equivalent privileges.
- Dependency CVEs with no demonstrated exploit path in Cocode. Open a normal
  issue for those.

## Handling credentials

Cocode never writes credentials into the session log. DeepSeek API keys live in
the DSH credentials file under `$DSH_HOME`; Cocode identity tokens live in
`account.yaml` under `~/.cocode`. If you find either in a log, a diagnostic
bundle, or a crash report, treat it as a vulnerability and report it.

Never include real API keys, tokens, or session logs in an issue, a pull request,
or a reproduction case.
