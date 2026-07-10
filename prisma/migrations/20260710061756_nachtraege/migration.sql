-- CreateEnum
CREATE TYPE "NachtragStatus" AS ENUM ('ANGEBOTEN', 'BEAUFTRAGT', 'ABGELEHNT');

-- CreateTable
CREATE TABLE "Nachtrag" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "nummer" INTEGER NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "status" "NachtragStatus" NOT NULL DEFAULT 'ANGEBOTEN',
    "notiz" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "beauftragtAm" TIMESTAMP(3),

    CONSTRAINT "Nachtrag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NachtragsPosition" (
    "id" TEXT NOT NULL,
    "nachtragId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "stichwort" TEXT NOT NULL,
    "langtext" TEXT NOT NULL DEFAULT '',
    "einheit" TEXT NOT NULL DEFAULT 'm²',
    "menge" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "epLohn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "epSonstiges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortier" INTEGER NOT NULL DEFAULT 0,
    "uebernommenePositionId" TEXT,

    CONSTRAINT "NachtragsPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nachtrag_lvId_nummer_key" ON "Nachtrag"("lvId", "nummer");

-- CreateIndex
CREATE INDEX "NachtragsPosition_nachtragId_idx" ON "NachtragsPosition"("nachtragId");

-- AddForeignKey
ALTER TABLE "Nachtrag" ADD CONSTRAINT "Nachtrag_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NachtragsPosition" ADD CONSTRAINT "NachtragsPosition_nachtragId_fkey" FOREIGN KEY ("nachtragId") REFERENCES "Nachtrag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
