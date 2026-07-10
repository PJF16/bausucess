-- CreateEnum
CREATE TYPE "AngebotStatus" AS ENUM ('EINGELADEN', 'ABGEGEBEN', 'AUSGESCHIEDEN', 'ZUSCHLAG');

-- CreateTable
CREATE TABLE "Bieter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firma" TEXT NOT NULL,
    "ansprechpartner" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "adresse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bieter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Angebot" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "bieterId" TEXT NOT NULL,
    "status" "AngebotStatus" NOT NULL DEFAULT 'EINGELADEN',
    "notiz" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Angebot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AngebotsPosition" (
    "id" TEXT NOT NULL,
    "angebotId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "ep" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "AngebotsPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Angebot_lvId_bieterId_key" ON "Angebot"("lvId", "bieterId");

-- CreateIndex
CREATE UNIQUE INDEX "AngebotsPosition_angebotId_positionId_key" ON "AngebotsPosition"("angebotId", "positionId");

-- AddForeignKey
ALTER TABLE "Bieter" ADD CONSTRAINT "Bieter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angebot" ADD CONSTRAINT "Angebot_bieterId_fkey" FOREIGN KEY ("bieterId") REFERENCES "Bieter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AngebotsPosition" ADD CONSTRAINT "AngebotsPosition_angebotId_fkey" FOREIGN KEY ("angebotId") REFERENCES "Angebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AngebotsPosition" ADD CONSTRAINT "AngebotsPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
