import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const GRUEN = "FFD9F2D9";
const GRAU = "FFF1F5F9";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projektId: string; lvId: string }> }
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { projektId, lvId } = await params;
  const lv = await prisma.lv.findFirst({
    where: {
      id: lvId,
      projekt: { id: projektId, tenantId: session.user.tenantId },
    },
    include: {
      projekt: true,
      gruppen: { orderBy: { sortier: "asc" } },
      positionen: { orderBy: { sortier: "asc" } },
      angebote: {
        orderBy: { createdAt: "asc" },
        include: { bieter: true, preise: true },
      },
    },
  });
  if (!lv) {
    return NextResponse.json({ error: "LV nicht gefunden" }, { status: 404 });
  }

  const angebote = lv.angebote;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BauSuccess Web";
  const blatt = workbook.addWorksheet("Preisspiegel");

  // Kopfzeilen
  blatt.addRow([`Preisspiegel: ${lv.bezeichnung}`]).font = {
    bold: true,
    size: 14,
  };
  blatt.addRow([
    `Projekt ${lv.projekt.nummer} ${lv.projekt.bezeichnung}` +
      (lv.projekt.auftraggeber ? ` · AG: ${lv.projekt.auftraggeber}` : ""),
  ]);
  blatt.addRow([]);

  // Tabellenkopf
  const kopf = blatt.addRow([
    "Pos.-Nr.",
    "Stichwort",
    "Menge",
    "ME",
    ...angebote.map((a) => a.bieter.firma),
  ]);
  kopf.font = { bold: true };
  kopf.eachCell((zelle) => {
    zelle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAU } };
    zelle.border = { bottom: { style: "thin" } };
  });

  blatt.columns = [
    { width: 10 },
    { width: 45 },
    { width: 12 },
    { width: 6 },
    ...angebote.map(() => ({ width: 18 })),
  ];

  const preisJeAngebot = angebote.map(
    (a) => new Map(a.preise.map((p) => [p.positionId, Number(p.ep)]))
  );

  // Gruppen rekursiv mit Positionen ausgeben
  const zaehlt = (art: string) => art !== "EVENTUAL" && art !== "ALTERNATIV";
  const summen = angebote.map(() => 0);

  const gruppenNach = (parentId: string | null) =>
    lv.gruppen.filter((g) => g.parentId === parentId);

  const schreibeGruppe = (gruppeId: string, pfad: string) => {
    const gruppe = lv.gruppen.find((g) => g.id === gruppeId)!;
    const nummer = pfad ? `${pfad}.${gruppe.nummer}` : gruppe.nummer;
    const gruppenZeile = blatt.addRow([
      `${gruppe.ebene} ${nummer}`,
      gruppe.bezeichnung,
    ]);
    gruppenZeile.font = { bold: true };
    gruppenZeile.eachCell((zelle) => {
      zelle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAU } };
    });

    for (const p of lv.positionen.filter((x) => x.gruppeId === gruppeId)) {
      const menge = Number(p.menge);
      const eps = preisJeAngebot.map((preise) => preise.get(p.id) ?? 0);
      const guenstigster = Math.min(...eps.filter((ep) => ep > 0));
      const zeile = blatt.addRow([
        p.nummer,
        p.stichwort,
        menge,
        p.einheit,
        ...eps.map((ep) => (ep > 0 ? ep : null)),
      ]);
      eps.forEach((ep, i) => {
        const zelle = zeile.getCell(5 + i);
        zelle.numFmt = "#,##0.00";
        if (ep > 0 && ep === guenstigster) {
          zelle.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: GRUEN },
          };
        }
        if (zaehlt(p.art)) summen[i] += menge * ep;
      });
      zeile.getCell(3).numFmt = "#,##0.000";
    }

    for (const kind of gruppenNach(gruppeId)) {
      schreibeGruppe(kind.id, nummer);
    }
  };

  for (const wurzel of gruppenNach(null)) {
    schreibeGruppe(wurzel.id, "");
  }

  // Summenzeile
  blatt.addRow([]);
  const minSumme = Math.min(...summen.filter((s) => s > 0));
  const summenZeile = blatt.addRow([
    "",
    "Angebotssumme (netto)",
    "",
    "",
    ...summen,
  ]);
  summenZeile.font = { bold: true };
  summen.forEach((s, i) => {
    const zelle = summenZeile.getCell(5 + i);
    zelle.numFmt = "#,##0.00";
    zelle.border = { top: { style: "double" } };
    if (s > 0 && s === minSumme) {
      zelle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRUEN } };
    }
  });

  const puffer = await workbook.xlsx.writeBuffer();
  const dateiname = `Preisspiegel_${lv.projekt.nummer}_${lv.bezeichnung}`
    .replace(/[^\wäöüÄÖÜß-]+/g, "_")
    .slice(0, 80);

  return new NextResponse(puffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dateiname}.xlsx"`,
    },
  });
}
