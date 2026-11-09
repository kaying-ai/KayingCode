# KayingCode Privacy Statement

**Updated:** 2026-11-09

**Scope:** The KayingCode source code published in this repository and its build artifacts. If you use a Relay, model service or other service deployed by a third party, that operator may have its own privacy policy; this statement does not replace it.

KayingCode runs local-first. We aim not to collect or transmit data related to your work content and credentials.

## 1. Data we do not collect

- **Model API keys and credentials:** You configure and store them locally. We do not upload or centrally store them.
- **Conversation content and workspace files:** Stored locally by default. This project provides no official cloud sync and does not upload your conversations, code or files to our servers.
- **Personal identity information:** Local use requires no account registration, and we do not ask for your name, phone number or email address.

## 2. Local operation and network requests

- **Model requests:** When you use a model service you configured, requests go directly from your machine to the endpoint you configured. That endpoint may log request content according to its operator's policy.
- **Disabled by default:** This product form disables telemetry reporting, the official KayingCode CDN, the online plugin marketplace, session share publishing and feedback tickets by default; plugins are limited to built-in and local installation. See [NOTICE.md](NOTICE.md) for feature and network behavior.
- **Local logs and caches:** To diagnose problems, the application may write logs, caches and session recovery data on your machine. Protect these files and avoid committing them to public repositories or sending them to untrusted parties.

## 3. Mobile remote control and Relay

When you use mobile remote control:

- Device identity, invitations and scan authorization credentials are managed by the client and the Relay. The Relay stores connection state such as the account, device, invitation, token digests and WebSocket lease.
- The Relay **does not store task content, does not parse business RPC, does not replay business data, and does not retain data while a client is disconnected**. Tasks, sessions, run state and snapshots remain in the Host/runtime already running on your desktop.
- The operator deploying the Relay may process connection metadata in server logs (for example IP addresses, timestamps and error details). Retention is determined by that operator.

## 4. Third-party components and services

- Built-in plugins, third-party plugins, platform tools such as TapTap, model providers and other services you connect to follow their own privacy policies and license terms.
- Before installing or enabling a third-party plugin, confirm the scope of data it can access.

## 5. Your responsibilities

- Protect API keys, access tokens, certificates and local logs. Do not submit real credentials or user data in issues, pull requests or other public channels.
- When using shared workspaces, remote hosts, containers or a Relay, confirm where your data is located and who can access it.

## 6. Changes and contact

We update the date in this file when the statement changes. For privacy or data questions, contact [service@kayingai.com](mailto:service@kayingai.com).
