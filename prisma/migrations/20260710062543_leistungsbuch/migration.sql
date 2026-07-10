-- CreateTable
CREATE TABLE "LbGruppe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parentId" TEXT,
    "nummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LbGruppe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LbPosition" (
    "id" TEXT NOT NULL,
    "gruppeId" TEXT NOT NULL,
    "nummer" TEXT NOT NULL,
    "stichwort" TEXT NOT NULL,
    "langtext" TEXT NOT NULL DEFAULT '',
    "einheit" TEXT NOT NULL DEFAULT 'm²',
    "sortier" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LbPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LbGruppe_tenantId_parentId_idx" ON "LbGruppe"("tenantId", "parentId");

-- CreateIndex
CREATE INDEX "LbPosition_gruppeId_idx" ON "LbPosition"("gruppeId");

-- AddForeignKey
ALTER TABLE "LbGruppe" ADD CONSTRAINT "LbGruppe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LbGruppe" ADD CONSTRAINT "LbGruppe_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LbGruppe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LbPosition" ADD CONSTRAINT "LbPosition_gruppeId_fkey" FOREIGN KEY ("gruppeId") REFERENCES "LbGruppe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
