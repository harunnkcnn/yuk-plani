# Security policy

Yük Planı is a static web app with no backend. Plans are stored in the browser's local storage and shared through the URL fragment (`#p=…`), which browsers do not send to servers.

- Strict Content-Security-Policy: scripts, styles, fonts and workers only from the app itself; `connect-src 'self'`.
- Share links are decoded defensively: malformed data is rejected and every value is clamped to a sane range.
- CSV export neutralises cells starting with `= + - @` to prevent spreadsheet formula injection.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting (Security tab → *Report a vulnerability*). You can expect a first response within 7 days.
