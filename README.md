# BauSuccess Web

Webbasierter Klon der Bausoftware **AUER Success 7**: Leistungsverzeichnisse,
Kalkulation, Ausschreibung/Vergabe und Abrechnung als moderne Multi-Tenant-Webanwendung.

## Stack

- **Next.js** (App Router, Server Actions, TypeScript, Tailwind CSS)
- **PostgreSQL** + **Prisma 6**
- **Auth.js (NextAuth v5)** mit Credentials-Login, JWT-Session inkl. Mandant & Rolle

## Lokal entwickeln

Voraussetzungen: Node.js ≥ 20 und Docker Desktop (für die Datenbank).

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebung anlegen (.env ist gitignored und muss lokal existieren)
cat > .env <<'EOF'
DATABASE_URL="postgresql://auer:auer@localhost:5433/auer"
AUTH_SECRET="dev-secret-change-in-production-0123456789abcdef"
AUTH_TRUST_HOST=true
EOF

# 3. Datenbank (Docker; legt den Container bei Bedarf an, sonst startet er ihn)
npm run db

# 4. Migrationen + Demodaten
npx prisma migrate dev
npm run seed

# 5. Dev-Server → http://localhost:3000
npm run dev
```

**Wichtig:** Docker Desktop muss laufen, bevor `npm run db` funktioniert –
sonst kommt „Cannot connect to the Docker daemon". Der Container hat die
Restart-Policy `unless-stopped` und startet daher nach einem Neustart von
Docker Desktop automatisch mit. Bei Datenbank-Problemen: `npm run db:logs`.

Demo-Login: `demo@bausuccess.at` / `demo1234`

**Hinweis zum Beleg-Snapshot-Backfill:** Die Migration ergänzt für bereits
gelegte Rechnungen historische Belegkopien. Teilrechnungen werden aus den ihnen
zugeordneten Aufmaßzeilen rekonstruiert. Bei älteren Schlussrechnungen stammen
die Positions- und Zeilendaten aus den zum Migrationszeitpunkt noch vorhandenen
Aufmaßzeilen; frühere Änderungen oder Löschungen lassen sich rückwirkend nicht
zuverlässig rekonstruieren. Vor dem Produktiv-Upgrade sollten bestehende
Schlussrechnungsbelege daher separat archiviert werden.

Vertrags-LVs, die vor dieser Migration erzeugt wurden, haben noch keine
eindeutige technische Verknüpfung zum bezuschlagten Angebot. Die Verknüpfung
wird für neue Vertrags-LVs automatisch angelegt; ältere Verträge sollten vor
einem Produktiv-Upgrade anhand ihrer Vergabeunterlagen geprüft werden.

## Produktiv starten (Docker)

Die App wird als Docker-Stack betrieben: Next.js im Standalone-Modus
([Dockerfile](Dockerfile)), Postgres 16 und ein Migrations-Job, der bei jedem
Start `prisma migrate deploy` ausführt ([docker-compose.prod.yml](docker-compose.prod.yml)).
Es wird nur Docker benötigt – kein lokales `npm install`, der Build läuft
komplett im Container.

```bash
# 1. Konfiguration anlegen und in .env.deploy ausfüllen:
#    POSTGRES_PASSWORD, AUTH_SECRET (siehe unten), AUTH_URL = öffentliche URL, APP_PORT
cp .env.deploy.example .env.deploy
openssl rand -base64 32   # → Wert für AUTH_SECRET

# 2. Images bauen und Stack starten (App + Postgres, Migrationen laufen automatisch)
npm run deploy:build
npm run deploy:up
# → App läuft auf http://localhost:<APP_PORT>

# Optional: Demodaten einspielen (nur für Demo-/Testbetrieb!)
npm run deploy:seed

# Betrieb
npm run deploy:logs   # App-Logs verfolgen
npm run deploy:down   # Stack stoppen (Daten bleiben im Volume erhalten)
```

Für ein Update auf einen neuen Code-Stand: `npm run deploy:build && npm run
deploy:up` – Compose ersetzt den App-Container, ausstehende Migrationen werden
vor dem Start eingespielt, die Datenbank bleibt unangetastet.

**Einmaliger Backfill nach dem Update auf den Rechnungs-Snapshot** (nur bei
einer Bestandsinstallation, die schon vor diesem Update Rechnungen *gelegt*
hatte): Rechnungen frieren ihre Beträge seit diesem Stand beim Legen ein.
Bereits gelegte Alt-Rechnungen bekommen ihren Snapshot mit

```bash
docker compose --env-file .env.deploy -f docker-compose.prod.yml \
  run --rm migrate npx tsx prisma/backfill-rechnungen.ts
```

Der Lauf ist idempotent; eine frische Installation hat keine Alt-Rechnungen
und braucht ihn nicht.

Hinweise:

- `AUTH_URL` **muss** auf die öffentliche URL zeigen und darf nie leer sein –
  ein leerer (aber definierter) Wert deaktiviert in Auth.js still `trustHost`
  und der Login schlägt mit `UntrustedHost` fehl.
- Vor dem Internet gehört ein Reverse-Proxy (nginx/Caddy/Traefik) mit TLS;
  die App lauscht auf `APP_PORT` (Standard 3000) nur als HTTP.
- Die Datenbank ist nicht nach außen veröffentlicht; Daten liegen im
  Docker-Volume `db-data`.
- Der Stack läuft unabhängig vom Dev-Container `clone-auer-db` (Port 5433).

## Datenmodell (Kern)

`Tenant` → `Membership` (Rolle: ADMIN/BEARBEITER/LESER) ← `User`
`Tenant` → `Projekt` → `Lv` → `LvGruppe` (Hierarchie HG/OG/LG/ULG) → `Position`

Positionen tragen Preisanteile nach ÖNORM B 2061 (`epLohn` + `epSonstiges` = EP).
Eventual- und Alternativpositionen zählen nicht zur LV-Summe.

## Roadmap

- [x] **Phase 1 – LV-Erstellung**: Projekte, LVs, Gruppenbaum, Positionen mit
      Inline-Bearbeitung, Summen (Gruppe/Netto/USt/Brutto)
- [x] **Phase 2 – Kalkulation**: Kalkulationsblatt je LV (vereinfachtes K3:
      Mittellohnkosten + Zuschläge je Kostenart → Mittellohnpreis),
      K7-Detailkalkulation je Position (Ansätze Lohn/Material/Gerät/Fremd/
      Sonstiges), Preisübernahme ins LV (einzeln oder gesamt)
- [x] **Phase 3 – Ausschreibung & Vergabe**: mandantenweite Bieterverwaltung,
      Preisspiegel je LV (Bieter einladen, Preise erfassen, günstigstes Angebot
      wird hervorgehoben), Zuschlag erteilen/zurückziehen, daraus automatisch
      ein Vertrags-LV mit den Bieterpreisen erzeugen (Lohn/Sonstiges-Split
      proportional zum Ausschreibungs-LV übernommen)
- [x] **Phase 4 – Abrechnung**: Aufmaßblätter mit Formel-Ansätzen
      (z. B. `12,50*3,20-2*1,01`, sicherer Parser ohne eval in
      `src/lib/aufmass.ts`; Punkt gilt nur als Tausendertrennzeichen bei
      eindeutigem Muster, mehrdeutige Eingaben wie `1.200` werden abgelehnt),
      Mengenermittlung je Position mit Soll-Vergleich und Überabrechnungs-
      Warnung. Teilrechnungen rechnen die offenen Aufmaße inkrementell ab,
      die Schlussrechnung kumuliert die Gesamtleistung und zieht die
      Zahlbeträge der Teilrechnungen ab (ÖNORM B 2110: Deckungsrücklass wird
      aufgelöst, Haftrücklass auf die Gesamtsumme). Beim Legen werden Beträge,
      Einheitspreise und Konditionen als Snapshot eingefroren
      (`src/lib/rechnung.ts`), sodass gelegte Rechnungen unveränderlich sind.
      Statusworkflow Entwurf → Gelegt → Bezahlt serverseitig erzwungen;
      abgerechnete Zeilen und Positionen sind gegen Löschen geschützt
- [x] **Phase 5 – ÖNORM-Datenaustausch**: Export jedes LV als `.onlv`-XML
      (A-2063-angelehnt: Kenndaten, Gliederung HG/OG/LG/ULG, Preisanteile
      Lohn/Sonstiges) und toleranter Import als neues LV im Projekt
      (`src/lib/onlv.ts`). Der Importer akzeptiert Strukturvarianten
      (hg/og/lg/ulg- oder gruppe-Elemente, pos/position, Attribute oder
      Kindelemente, Komma-/Punkt-Dezimale). **Hinweis:** Die offizielle
      A-2063-XSD ist kostenpflichtig (Austrian Standards) und nicht
      eingebunden – volle Kompatibilität mit echten AUER/ABK-Datenträgern
      ist daher nicht garantiert; Round-Trip innerhalb von BauSuccess Web
      ist verlustfrei.
- [x] **Alltagsfunktionen**: Projekte/LVs bearbeiten, duplizieren (inkl.
      Kalkulation) und löschen; Positionen und Gruppen umsortieren (▲▼);
      Volltextsuche über Projekte, LVs und Positionen (Kopfleiste)
- [x] **Fachliche Tiefe**: Rechnungskonditionen (Deckungs-/Haftrücklass,
      Skonto – Abzugsblock in der Rechnung), Nachtragsverwaltung (Status
      Angeboten/Beauftragt/Abgelehnt, Beauftragung übernimmt Positionen als
      NT-Gruppe ins LV), Leistungsbuch (`/leistungsbuch`, Übernahme im
      LV-Editor über „+ aus Leistungsbuch"), Preisspiegel-Export nach
      Excel (Button „⬇ Excel" in der Vergabe)
- [x] **Feinschliff**: Benutzerverwaltung unter `/benutzer` (Admin legt
      Benutzer an, vergibt Rollen; Rollenwechsel greift beim nächsten Login),
      LESER-Rolle wird server- und clientseitig durchgesetzt (alle
      schreibenden Server Actions prüfen `requireBearbeiter`, Editoren sind
      read-only), Langtext-Bearbeitung je Position im LV-Editor (≡-Toggle),
      Druckansicht für LV (`…/druck`) und Rechnungen – PDF über den
      Browser-Druckdialog
