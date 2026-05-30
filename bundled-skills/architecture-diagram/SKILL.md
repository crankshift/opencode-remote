---
name: architecture-diagram
description: Use when creating technical architecture, infrastructure, service, database, or deployment diagrams for OpenCode Remote media delivery.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Architecture Diagram

Create professional technical diagrams for systems, infrastructure, and software architecture.

## Visual Rules

- Group components by layer or responsibility.
- Use consistent semantic colors for frontend, backend, data, external, security, and messaging components.
- Keep arrows readable and avoid crossing lines when possible.
- Fit labels for mobile viewing.

## Output Contract

- Prefer exporting the final diagram to PNG for OpenCode Remote delivery.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the exported file on its own line as `MEDIA:/absolute/path/to/file.png`.
- If the user also wants editable source, provide the HTML/SVG/Mermaid/Excalidraw path separately.

## Privacy

- Sanitize infrastructure details when the user has not explicitly approved sharing exact hostnames, internal names, or secrets.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
