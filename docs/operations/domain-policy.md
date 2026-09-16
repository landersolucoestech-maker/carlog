# Domain Policy

The Car Log repository must not depend on, embed, redirect to, proxy, or deploy against `carlogconnection.com`.

Runtime endpoints are configuration, not source-code constants:

- `ADMIN_URL` — public URL for the Car Log Admin OS.
- `API_URL` — public URL for the Car Log API.
- `PUBLIC_WEB_URL` — optional origin allowed to submit website leads/chat when a separately managed public website is explicitly integrated.
- `CARLOG_TLS_CERT_NAME` — Let's Encrypt certificate directory name used by the Hostinger Nginx deployment.

GitHub Actions and the architecture audit reject the deprecated domain if it is reintroduced. GitHub Pages remains a read-only Admin OS preview and does not represent a public marketing website.
