# KI-Zugang Jeffa-Hub
Repo (privat): https://github.com/mariechrisart77-web/jeffa-hub
Branches: main = Live v86 (6b2c27f), v87-work = aktueller Stand.
Regeln für externe KIs:
- Nur auf eigenen Branches arbeiten, nie auf main pushen.
- Jede Änderung in der Vorschau prüfen: https://<branch>.jeffa-hub.pages.dev und https://<branch>.jeffa-bild.pages.dev (+ /api/health).
- Produktion nur nach Maries OK (Merge nach main + deploy-Skript). Keine Schlüssel ins Repo; Secrets liegen in GitHub/Cloudflare.
Vorschau: GitHub Actions Workflow .github/workflows/preview.yml (auf v87-work gepusht; npm ci ok, scheitert aktuell an fehlschlagenden Tests AP1–AP3).
- Läufe ansehen: https://github.com/mariechrisart77-web/jeffa-hub/actions (gh run list)
