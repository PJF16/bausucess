ALTER TYPE "RechnungStatus" ADD VALUE 'STORNIERT';

ALTER TABLE "Rechnung"
  ADD COLUMN "storniertAm" TIMESTAMP(3),
  ADD COLUMN "stornoGrund" TEXT,
  ADD COLUMN "snapshotProjektNummer" TEXT,
  ADD COLUMN "snapshotProjektBezeichnung" TEXT,
  ADD COLUMN "snapshotAuftraggeber" TEXT,
  ADD COLUMN "snapshotLvBezeichnung" TEXT;

ALTER TABLE "RechnungsPosition"
  ADD COLUMN "nummer" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "stichwort" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "langtext" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "einheit" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "menge" DECIMAL(14,3) NOT NULL DEFAULT 0;

UPDATE "RechnungsPosition" rp
SET "nummer" = p."nummer", "stichwort" = p."stichwort",
    "langtext" = p."langtext", "einheit" = p."einheit",
    "menge" = COALESCE((
      SELECT SUM(z."menge") FROM "Aufmasszeile" z
      JOIN "Aufmassblatt" b ON b."id" = z."blattId"
      JOIN "Rechnung" r ON r."id" = rp."rechnungId"
      WHERE z."positionId" = rp."positionId"
        AND (r."art" = 'SCHLUSSRECHNUNG' AND z."rechnungId" IS NOT NULL
          OR r."art" = 'TEILRECHNUNG' AND z."rechnungId" = r."id")
    ), 0)
FROM "Position" p
WHERE p."id" = rp."positionId";

CREATE TABLE "RechnungsZeile" (
  "id" TEXT NOT NULL,
  "rechnungId" TEXT NOT NULL,
  "sourceZeileId" TEXT NOT NULL,
  "positionId" TEXT NOT NULL,
  "sourceRechnungNummer" INTEGER,
  "blattNummer" INTEGER NOT NULL,
  "blattBezeichnung" TEXT NOT NULL,
  "positionsNummer" TEXT NOT NULL,
  "positionStichwort" TEXT NOT NULL,
  "positionLangtext" TEXT NOT NULL DEFAULT '',
  "einheit" TEXT NOT NULL,
  "zeilenBezeichnung" TEXT NOT NULL,
  "ansatz" TEXT NOT NULL,
  "menge" DECIMAL(14,3) NOT NULL,
  "ep" DECIMAL(14,2) NOT NULL,
  "sortier" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RechnungsZeile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RechnungsZeile_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RechnungsZeile_rechnungId_sortier_idx" ON "RechnungsZeile"("rechnungId", "sortier");

UPDATE "Rechnung" r
SET "snapshotProjektNummer" = p."nummer",
    "snapshotProjektBezeichnung" = p."bezeichnung",
    "snapshotAuftraggeber" = p."auftraggeber",
    "snapshotLvBezeichnung" = lv."bezeichnung"
FROM "Lv" lv JOIN "Projekt" p ON p."id" = lv."projektId"
WHERE r."lvId" = lv."id" AND r."status" IN ('GELEGT', 'BEZAHLT');

INSERT INTO "RechnungsZeile" (
  "id", "rechnungId", "sourceZeileId", "positionId", "sourceRechnungNummer", "blattNummer", "blattBezeichnung",
  "positionsNummer", "positionStichwort", "positionLangtext", "einheit",
  "zeilenBezeichnung", "ansatz", "menge", "ep", "sortier"
)
SELECT 'legacy_' || z."id" || '_' || r."id", r."id", z."id", z."positionId", source."nummer",
       b."nummer", b."bezeichnung", p."nummer", p."stichwort", p."langtext", p."einheit",
       z."bezeichnung", z."ansatz", z."menge", COALESCE(rp."ep", 0), z."sortier"
FROM "Rechnung" r
JOIN "Aufmasszeile" z ON (r."art" = 'SCHLUSSRECHNUNG' AND z."rechnungId" IS NOT NULL
  OR r."art" = 'TEILRECHNUNG' AND z."rechnungId" = r."id")
JOIN "Aufmassblatt" b ON b."id" = z."blattId"
JOIN "Position" p ON p."id" = z."positionId"
LEFT JOIN "Rechnung" source ON source."id" = z."rechnungId"
LEFT JOIN "RechnungsPosition" rp ON rp."rechnungId" = r."id" AND rp."positionId" = z."positionId"
WHERE r."status" IN ('GELEGT', 'BEZAHLT');

ALTER TABLE "Lv" ADD COLUMN "angebotId" TEXT;
CREATE UNIQUE INDEX "Lv_angebotId_key" ON "Lv"("angebotId");
ALTER TABLE "Lv" ADD CONSTRAINT "Lv_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "Angebot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Angebot" DROP CONSTRAINT "Angebot_lvId_fkey";
ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Angebot" DROP CONSTRAINT "Angebot_bieterId_fkey";
ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_bieterId_fkey" FOREIGN KEY ("bieterId") REFERENCES "Bieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bieter" ADD COLUMN "archiviertAm" TIMESTAMP(3);
