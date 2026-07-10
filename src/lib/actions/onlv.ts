"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { onlvXmlParsen, type OnlvGruppe } from "@/lib/onlv";
import type { LvArt, GruppenEbene, PositionsArt, Prisma } from "@prisma/client";

export async function lvImportieren(
  projektId: string,
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (user.rolle === "LESER") {
    return { error: "Keine Berechtigung – Ihr Konto hat nur Lesezugriff." };
  }
  const projekt = await prisma.projekt.findFirst({
    where: { id: projektId, tenantId: user.tenantId },
  });
  if (!projekt) return { error: "Projekt nicht gefunden." };

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    return { error: "Bitte eine .onlv-Datei auswählen." };
  }
  if (datei.size > 10 * 1024 * 1024) {
    return { error: "Die Datei ist zu groß (max. 10 MB)." };
  }

  let xml: string;
  try {
    xml = await datei.text();
  } catch {
    return { error: "Die Datei konnte nicht gelesen werden." };
  }

  let onlv;
  try {
    onlv = onlvXmlParsen(xml);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Die Datei konnte nicht verarbeitet werden.",
    };
  }

  const lvId = await prisma.$transaction(async (tx) => {
    const lv = await tx.lv.create({
      data: {
        projektId,
        bezeichnung: onlv.bezeichnung,
        art: onlv.art as LvArt,
        waehrung: onlv.waehrung,
        ustSatz: onlv.ustSatz,
      },
    });

    const gruppeAnlegen = async (
      g: OnlvGruppe,
      parentId: string | null,
      sortier: number
    ): Promise<void> => {
      const gruppe = await tx.lvGruppe.create({
        data: {
          lvId: lv.id,
          parentId,
          ebene: g.ebene as GruppenEbene,
          nummer: g.nummer,
          bezeichnung: g.bezeichnung,
          sortier,
        },
      });
      if (g.positionen.length > 0) {
        await tx.position.createMany({
          data: g.positionen.map(
            (p, i): Prisma.PositionCreateManyInput => ({
              lvId: lv.id,
              gruppeId: gruppe.id,
              nummer: p.nummer,
              stichwort: p.stichwort,
              langtext: p.langtext,
              einheit: p.einheit,
              menge: p.menge,
              art: p.art as PositionsArt,
              epLohn: p.epLohn,
              epSonstiges: p.epSonstiges,
              sortier: i + 1,
            })
          ),
        });
      }
      for (const [i, kind] of g.gruppen.entries()) {
        await gruppeAnlegen(kind, gruppe.id, i + 1);
      }
    };

    for (const [i, g] of onlv.gruppen.entries()) {
      await gruppeAnlegen(g, null, i + 1);
    }

    return lv.id;
  });

  revalidatePath(`/projekte/${projektId}`);
  redirect(`/projekte/${projektId}/lv/${lvId}`);
}
