-- CreateEnum
CREATE TYPE "AnsatzArt" AS ENUM ('LOHN', 'MATERIAL', 'GERAET', 'FREMDLEISTUNG', 'SONSTIGES');

-- CreateTable
CREATE TABLE "Kalkulation" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "mittellohnkosten" DECIMAL(10,2) NOT NULL DEFAULT 40,
    "zuschlagLohn" DECIMAL(6,2) NOT NULL DEFAULT 85,
    "zuschlagMaterial" DECIMAL(6,2) NOT NULL DEFAULT 12,
    "zuschlagGeraet" DECIMAL(6,2) NOT NULL DEFAULT 15,
    "zuschlagFremd" DECIMAL(6,2) NOT NULL DEFAULT 8,
    "zuschlagSonstiges" DECIMAL(6,2) NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kalkulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KalkAnsatz" (
    "id" TEXT NOT NULL,
    "kalkulationId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "art" "AnsatzArt" NOT NULL DEFAULT 'MATERIAL',
    "bezeichnung" TEXT NOT NULL,
    "menge" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "einheit" TEXT NOT NULL DEFAULT 'h',
    "preis" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KalkAnsatz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kalkulation_lvId_key" ON "Kalkulation"("lvId");

-- CreateIndex
CREATE INDEX "KalkAnsatz_positionId_idx" ON "KalkAnsatz"("positionId");

-- AddForeignKey
ALTER TABLE "Kalkulation" ADD CONSTRAINT "Kalkulation_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KalkAnsatz" ADD CONSTRAINT "KalkAnsatz_kalkulationId_fkey" FOREIGN KEY ("kalkulationId") REFERENCES "Kalkulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KalkAnsatz" ADD CONSTRAINT "KalkAnsatz_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
