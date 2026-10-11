-- Verwaiste Verknüpfungen bereinigen, bevor der Fremdschlüssel angelegt wird
-- (uebernommenePositionId war bisher ein nackter String ohne Constraint).
UPDATE "NachtragsPosition" np
SET "uebernommenePositionId" = NULL
WHERE np."uebernommenePositionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Position" p WHERE p."id" = np."uebernommenePositionId"
  );

-- AlterTable
ALTER TABLE "Rechnung" ADD COLUMN     "bereitsVerrechnet" DECIMAL(14,2),
ADD COLUMN     "gelegtAm" TIMESTAMP(3),
ADD COLUMN     "netto" DECIMAL(14,2),
ADD COLUMN     "ruecklassSatz" DECIMAL(5,2),
ADD COLUMN     "skontoSatz" DECIMAL(5,2),
ADD COLUMN     "skontoTage" INTEGER,
ADD COLUMN     "ustSatz" DECIMAL(5,2),
ADD COLUMN     "zahlbetrag" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "RechnungsPosition" (
    "id" TEXT NOT NULL,
    "rechnungId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "ep" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "RechnungsPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RechnungsPosition_positionId_idx" ON "RechnungsPosition"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "RechnungsPosition_rechnungId_positionId_key" ON "RechnungsPosition"("rechnungId", "positionId");

-- AddForeignKey
ALTER TABLE "RechnungsPosition" ADD CONSTRAINT "RechnungsPosition_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechnungsPosition" ADD CONSTRAINT "RechnungsPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NachtragsPosition" ADD CONSTRAINT "NachtragsPosition_uebernommenePositionId_fkey" FOREIGN KEY ("uebernommenePositionId") REFERENCES "Position"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
