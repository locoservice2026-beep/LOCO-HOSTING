LOCO-HOSTING (scaffold)
========================

Kurze Demo‑Plattform zum Hosten von Bots (Scaffold).

Features:
- Registrierung mit Vorname/Nachname/E‑Mail/Passwort
- E‑Mail‑Verifikation via 6‑stelliger OTP
- Login (JWT in Cookie)
- Dashboard: Bots erstellen, starten, stoppen
- Webhook‑Endpoint für Bots
- Admin‑Panel (nur `role = admin`)
- Docker + docker-compose für 24/7‑Deployment (Restart‑Policy)

Wichtig: Für echtes 24/7‑Hosting deploye diese App auf einen Server/VPS oder Platform (DigitalOcean, AWS, Railway, etc.). Lokales Starten hostet nur solange der Rechner läuft.

Quickstart (lokal)
-------------------

1. Kopiere `.env.example` zu `.env` und fülle SMTP/Secret.

2. Installiere Abhängigkeiten und starte:

```bash
npm install
npm start
```

3. Öffne `http://localhost:3000/register.html`

Docker
------

Mit Docker Compose:

```bash
cp .env.example .env
# fill the .env values
docker compose up --build -d
```

E‑Mail
-----
Die App verschickt OTP per SMTP. Falls du lokal testen willst, kannst du `mailhog` oder `smtp4dev` nutzen und `SMTP_HOST`/`SMTP_PORT` darauf setzen.

Security & Produktion
---------------------
- Setze `JWT_SECRET` auf einen starken geheimen Wert.
- Setze TLS/HTTPS in Produktion.
- Für persistente Produktion sinnvoll: benutze Postgres, externe Datei‑Speicherung, PM2 oder Kubernetes für robusten Prozess‑Supervisor.

Hinweis zum 24/7‑Betrieb
------------------------
Die App selbst kann Bots als Node‑Prozesse starten; damit die Bots dauerhaft laufen, deploye den Container auf einen Server mit `restart: unless-stopped` oder verwende PM2 inside container / systemd / Kubernetes.
# LOCO-HOSTING