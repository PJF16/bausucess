-- CreateEnum
CREATE TYPE "Rolle" AS ENUM ('ADMIN', 'BEARBEITER', 'LESER');

-- CreateEnum
CREATE TYPE "ProjektStatus" AS ENUM ('AKTIV', 'ABGESCHLOSSEN', 'ARCHIVIERT');

-- CreateEnum
CREATE TYPE "LvArt" AS ENUM ('ENTWURFS_LV', 'KOSTENSCHAETZUNGS_LV', 'AUSSCHREIBUNGS_LV', 'ANGEBOTS_LV', 'VERTRAGS_LV', 'ABRECHNUNGS_LV');

-- CreateEnum
CREATE TYPE "GruppenEbene" AS ENUM ('HG', 'OG', 'LG', 'ULG');

-- CreateEnum
CREATE TYPE "PositionsArt" AS ENUM ('NORMAL', 'WESENTLICH', 'EVENTUAL', 'ALTERNATIV', 'REGIE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rolle" "Rolle" NOT NULL DEFAULT 'BEARBEITER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projekt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "auftraggeber" TEXT,
    "ort" TEXT,
    "status" "ProjektStatus" NOT NULL DEFAULT 'AKTIV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projekt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lv" (
    "id" TEXT NOT NULL,
    "projektId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "art" "LvArt" NOT NULL DEFAULT 'AUSSCHREIBUNGS_LV',
    "waehrung" TEXT NOT NULL DEFAULT 'EUR',
    "ustSatz" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LvGruppe" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "parentId" TEXT,
    "ebene" "GruppenEbene" NOT NULL,
    "nummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LvGruppe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "lvId" TEXT NOT NULL,
    "gruppeId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "stichwort" TEXT NOT NULL,
    "langtext" TEXT NOT NULL DEFAULT '',
    "einheit" TEXT NOT NULL DEFAULT 'm²',
    "menge" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "art" "PositionsArt" NOT NULL DEFAULT 'NORMAL',
    "epLohn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "epSonstiges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Projekt_tenantId_nummer_key" ON "Projekt"("tenantId", "nummer");

-- CreateIndex
CREATE INDEX "LvGruppe_lvId_parentId_idx" ON "LvGruppe"("lvId", "parentId");

-- CreateIndex
CREATE INDEX "Position_lvId_idx" ON "Position"("lvId");

-- CreateIndex
CREATE INDEX "Position_gruppeId_idx" ON "Position"("gruppeId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Projekt" ADD CONSTRAINT "Projekt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lv" ADD CONSTRAINT "Lv_projektId_fkey" FOREIGN KEY ("projektId") REFERENCES "Projekt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LvGruppe" ADD CONSTRAINT "LvGruppe_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LvGruppe" ADD CONSTRAINT "LvGruppe_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LvGruppe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_lvId_fkey" FOREIGN KEY ("lvId") REFERENCES "Lv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_gruppeId_fkey" FOREIGN KEY ("gruppeId") REFERENCES "LvGruppe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
