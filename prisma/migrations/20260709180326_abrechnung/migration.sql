-- CreateEnum
CREATE TYPE "RechnungArt" AS ENUM ('TEILRECHNUNG', 'SCHLUSSRECHNUNG');

-- CreateEnum
CREATE TYPE "RechnungStatus" AS ENUM ('ENTWURF', 'GELEGT', 'BEZAHLT');

-- CreateTable
CREATE TABLE "Aufmassblatt" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "nummer" INTEGER NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aufmassblatt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aufmasszeile" (
    "id" TEXT NOT NULL,
    "blattId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "rechnungId" TEXT,
    "bezeichnung" TEXT NOT NULL DEFAULT '',
    "ansatz" TEXT NOT NULL DEFAULT '',
    "menge" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Aufmasszeile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rechnung" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "nummer" INTEGER NOT NULL,
    "art" "RechnungArt" NOT NULL DEFAULT 'TEILRECHNUNG',
    "status" "RechnungStatus" NOT NULL DEFAULT 'ENTWURF',
    "datum" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rechnung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aufmassblatt_lvId_nummer_key" ON "Aufmassblatt"("lvId", "nummer");

-- CreateIndex
CREATE INDEX "Aufmasszeile_positionId_idx" ON "Aufmasszeile"("positionId");

-- CreateIndex
CREATE INDEX "Aufmasszeile_blattId_idx" ON "Aufmasszeile"("blattId");

-- CreateIndex
CREATE INDEX "Aufmasszeile_rechnungId_idx" ON "Aufmasszeile"("rechnungId");

-- CreateIndex
CREATE UNIQUE INDEX "Rechnung_lvId_nummer_key" ON "Rechnung"("lvId", "nummer");

-- AddForeignKey
ALTER TABLE "Aufmassblatt" ADD CONSTRAINT "Aufmassblatt_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aufmasszeile" ADD CONSTRAINT "Aufmasszeile_blattId_fkey" FOREIGN KEY ("blattId") REFERENCES "Aufmassblatt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aufmasszeile" ADD CONSTRAINT "Aufmasszeile_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aufmasszeile" ADD CONSTRAINT "Aufmasszeile_rechnungId_fkey" FOREIGN KEY ("rechnungId") REFERENCES "Rechnung"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rechnung" ADD CONSTRAINT "Rechnung_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;
