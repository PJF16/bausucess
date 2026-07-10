import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "demo@bausuccess.at" },
  });
  if (existing) {
    console.log("Demodaten existieren bereits – prüfe Kalkulation/Vergabe/LB …");
    await kalkulationSeeden();
    await vergabeSeeden();
    await leistungsbuchSeeden();
    return;
  }

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const tenant = await prisma.tenant.create({
    data: {
      name: "Muster Bau GmbH",
      memberships: {
        create: {
          rolle: "ADMIN",
          user: {
            create: {
              email: "demo@bausuccess.at",
              name: "Demo Benutzer",
              passwordHash,
            },
          },
        },
      },
    },
  });

  const projekt = await prisma.projekt.create({
    data: {
      tenantId: tenant.id,
      nummer: "2026-001",
      bezeichnung: "Wohnanlage Musterstraße",
      auftraggeber: "Gemeinde Musterdorf",
      ort: "Musterdorf",
    },
  });

  const lv = await prisma.lv.create({
    data: {
      projektId: projekt.id,
      bezeichnung: "Baumeisterarbeiten",
      art: "AUSSCHREIBUNGS_LV",
    },
  });

  // Struktur nach LB-Hochbau-Muster
  const lg01 = await prisma.lvGruppe.create({
    data: {
      lvId: lv.id,
      ebene: "LG",
      nummer: "01",
      bezeichnung: "Baustellengemeinkosten",
      sortier: 1,
    },
  });
  const lg02 = await prisma.lvGruppe.create({
    data: {
      lvId: lv.id,
      ebene: "LG",
      nummer: "02",
      bezeichnung: "Abbrucharbeiten",
      sortier: 2,
    },
  });
  const lg07 = await prisma.lvGruppe.create({
    data: {
      lvId: lv.id,
      ebene: "LG",
      nummer: "07",
      bezeichnung: "Beton- und Stahlbetonarbeiten",
      sortier: 3,
    },
  });
  const ulg0701 = await prisma.lvGruppe.create({
    data: {
      lvId: lv.id,
      parentId: lg07.id,
      ebene: "ULG",
      nummer: "01",
      bezeichnung: "Beton unbewehrt",
      sortier: 1,
    },
  });
  const ulg0702 = await prisma.lvGruppe.create({
    data: {
      lvId: lv.id,
      parentId: lg07.id,
      ebene: "ULG",
      nummer: "02",
      bezeichnung: "Stahlbeton",
      sortier: 2,
    },
  });

  await prisma.position.createMany({
    data: [
      {
        lvId: lv.id,
        gruppeId: lg01.id,
        nummer: "01A",
        stichwort: "Baustelle einrichten",
        einheit: "PA",
        menge: 1,
        epLohn: 2500,
        epSonstiges: 4800,
        sortier: 1,
      },
      {
        lvId: lv.id,
        gruppeId: lg01.id,
        nummer: "02A",
        stichwort: "Baustelle räumen",
        einheit: "PA",
        menge: 1,
        epLohn: 1200,
        epSonstiges: 1800,
        sortier: 2,
      },
      {
        lvId: lv.id,
        gruppeId: lg02.id,
        nummer: "01A",
        stichwort: "Abbruch Mauerwerk bis 30 cm",
        einheit: "m³",
        menge: 45.5,
        epLohn: 38.2,
        epSonstiges: 24.6,
        sortier: 1,
      },
      {
        lvId: lv.id,
        gruppeId: ulg0701.id,
        nummer: "01A",
        stichwort: "Sauberkeitsschicht C8/10, 5 cm",
        einheit: "m²",
        menge: 320,
        epLohn: 6.8,
        epSonstiges: 9.4,
        sortier: 1,
      },
      {
        lvId: lv.id,
        gruppeId: ulg0702.id,
        nummer: "01A",
        stichwort: "Fundamentplatte C25/30, d=30 cm",
        einheit: "m³",
        menge: 96,
        epLohn: 42.5,
        epSonstiges: 118.7,
        sortier: 1,
      },
      {
        lvId: lv.id,
        gruppeId: ulg0702.id,
        nummer: "02A",
        stichwort: "Bewehrung BSt 550, Stabstahl",
        einheit: "kg",
        menge: 11500,
        epLohn: 0.45,
        epSonstiges: 0.92,
        sortier: 2,
      },
      {
        lvId: lv.id,
        gruppeId: ulg0702.id,
        nummer: "03A",
        stichwort: "Wände C25/30, d=25 cm, beidseitig geschalt",
        einheit: "m²",
        menge: 480,
        epLohn: 28.9,
        epSonstiges: 41.3,
        art: "WESENTLICH",
        sortier: 3,
      },
    ],
  });

  console.log("Demodaten angelegt: demo@bausuccess.at / demo1234");
  await kalkulationSeeden();
}

/** Kalkulationsblatt + K7-Ansätze für das Demo-LV (idempotent). */
async function kalkulationSeeden() {
  const lv = await prisma.lv.findFirst({
    where: {
      bezeichnung: "Baumeisterarbeiten",
      projekt: { nummer: "2026-001", tenant: { name: "Muster Bau GmbH" } },
    },
  });
  if (!lv) return;

  const kalkulation = await prisma.kalkulation.upsert({
    where: { lvId: lv.id },
    update: {},
    create: { lvId: lv.id },
  });

  const vorhandene = await prisma.kalkAnsatz.count({
    where: { kalkulationId: kalkulation.id },
  });
  if (vorhandene > 0) {
    console.log("Kalkulations-Demodaten existieren bereits.");
    return;
  }

  const fundament = await prisma.position.findFirst({
    where: { lvId: lv.id, stichwort: { startsWith: "Fundamentplatte" } },
  });
  const bewehrung = await prisma.position.findFirst({
    where: { lvId: lv.id, stichwort: { startsWith: "Bewehrung" } },
  });
  if (!fundament || !bewehrung) return;

  await prisma.kalkAnsatz.createMany({
    data: [
      {
        kalkulationId: kalkulation.id,
        positionId: fundament.id,
        art: "LOHN",
        bezeichnung: "Betonpartie Einbau/Abziehen",
        menge: 1.1,
        einheit: "h",
        sortier: 1,
      },
      {
        kalkulationId: kalkulation.id,
        positionId: fundament.id,
        art: "MATERIAL",
        bezeichnung: "Transportbeton C25/30 inkl. Verschnitt",
        menge: 1.02,
        einheit: "m³",
        preis: 95,
        sortier: 2,
      },
      {
        kalkulationId: kalkulation.id,
        positionId: fundament.id,
        art: "GERAET",
        bezeichnung: "Betonpumpe anteilig",
        menge: 0.05,
        einheit: "h",
        preis: 180,
        sortier: 3,
      },
      {
        kalkulationId: kalkulation.id,
        positionId: bewehrung.id,
        art: "LOHN",
        bezeichnung: "Eisenbieger Verlegen",
        menge: 0.012,
        einheit: "h",
        sortier: 1,
      },
      {
        kalkulationId: kalkulation.id,
        positionId: bewehrung.id,
        art: "MATERIAL",
        bezeichnung: "Bewehrungsstahl BSt 550 inkl. Verschnitt",
        menge: 1.03,
        einheit: "kg",
        preis: 0.78,
        sortier: 2,
      },
    ],
  });
  console.log("Kalkulations-Demodaten angelegt.");
}

/** Bieter + Angebote mit Preisspiegel-Werten für das Demo-LV (idempotent). */
async function vergabeSeeden() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: "Muster Bau GmbH" },
  });
  const lv = await prisma.lv.findFirst({
    where: {
      bezeichnung: "Baumeisterarbeiten",
      projekt: { nummer: "2026-001", tenant: { name: "Muster Bau GmbH" } },
    },
  });
  if (!tenant || !lv) return;

  const bestehend = await prisma.angebot.count({ where: { lvId: lv.id } });
  if (bestehend > 0) {
    console.log("Vergabe-Demodaten existieren bereits.");
    return;
  }

  const positionen = await prisma.position.findMany({ where: { lvId: lv.id } });
  if (positionen.length === 0) return;

  const bieterDaten = [
    { firma: "Hoch- und Tiefbau Berger GmbH", ansprechpartner: "Ing. Berger", faktor: 0.97 },
    { firma: "Alpen Bau Gesellschaft mbH", ansprechpartner: "Fr. Alpen", faktor: 1.04 },
    { firma: "Stein & Partner Bauunternehmung", ansprechpartner: "Hr. Stein", faktor: 1.11 },
  ];

  for (const [i, b] of bieterDaten.entries()) {
    const bieter = await prisma.bieter.create({
      data: {
        tenantId: tenant.id,
        firma: b.firma,
        ansprechpartner: b.ansprechpartner,
        email: "office@" + b.firma.toLowerCase().replace(/[^a-z]+/g, "-") + ".at",
      },
    });
    const angebot = await prisma.angebot.create({
      data: {
        lvId: lv.id,
        bieterId: bieter.id,
        status: i === 2 ? "AUSGESCHIEDEN" : "ABGEGEBEN",
      },
    });
    await prisma.angebotsPosition.createMany({
      data: positionen.map((p) => {
        const epEigen = Number(p.epLohn) + Number(p.epSonstiges);
        return {
          angebotId: angebot.id,
          positionId: p.id,
          ep: Math.round(epEigen * b.faktor * 100) / 100,
        };
      }),
    });
  }
  console.log("Vergabe-Demodaten angelegt.");
}

/** Leistungsbuch mit LB-Hochbau-artigen Beispieldaten (idempotent). */
async function leistungsbuchSeeden() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: "Muster Bau GmbH" },
  });
  if (!tenant) return;

  const vorhandene = await prisma.lbGruppe.count({
    where: { tenantId: tenant.id },
  });
  if (vorhandene > 0) {
    console.log("Leistungsbuch-Demodaten existieren bereits.");
    return;
  }

  const katalog: Array<{
    nummer: string;
    bezeichnung: string;
    positionen: Array<[string, string, string, string]>; // [nr, stichwort, einheit, langtext]
  }> = [
    {
      nummer: "01",
      bezeichnung: "Baustellengemeinkosten",
      positionen: [
        ["01A", "Baustelle einrichten", "PA", "Einrichten der Baustelle einschließlich aller Nebenleistungen. Vorhalten für die gesamte Bauzeit."],
        ["02A", "Baustelle räumen", "PA", "Räumen der Baustelle nach Fertigstellung, Wiederherstellen des ursprünglichen Zustands."],
        ["03A", "Bauzaun herstellen und vorhalten", "m", "Bauzaun H=2,0 m, standsicher, inkl. Tore, für die gesamte Bauzeit."],
      ],
    },
    {
      nummer: "02",
      bezeichnung: "Abbruch- und Erdarbeiten",
      positionen: [
        ["01A", "Abbruch Mauerwerk", "m³", "Abbruch von Mauerwerk jeder Art, Dicke bis 30 cm, inkl. Verladen und Entsorgen."],
        ["02A", "Baugrubenaushub", "m³", "Aushub der Baugrube in Bodenklasse 3–5, Aushubmaterial seitlich lagern oder abführen."],
        ["03A", "Hinterfüllung verdichten", "m³", "Hinterfüllen mit geeignetem Material, lagenweise verdichtet."],
      ],
    },
    {
      nummer: "07",
      bezeichnung: "Beton- und Stahlbetonarbeiten",
      positionen: [
        ["01A", "Sauberkeitsschicht C8/10", "m²", "Sauberkeitsschicht aus Beton C8/10, Dicke 5 cm, Oberfläche abgezogen."],
        ["02A", "Fundamentplatte C25/30", "m³", "Fundamentplatte aus Stahlbeton C25/30, inkl. Schalung der Ränder, ohne Bewehrung."],
        ["03A", "Bewehrung BSt 550 Stabstahl", "kg", "Liefern, Schneiden, Biegen und Verlegen von Bewehrungsstahl BSt 550."],
        ["04A", "Wände C25/30 beidseitig geschalt", "m²", "Stahlbetonwände C25/30, Dicke 25 cm, beidseitige Schalung, sichtbare Flächen schalungsglatt."],
        ["05A", "Decke C25/30 über EG", "m²", "Stahlbetondecke C25/30, Dicke 20 cm, inkl. Deckenschalung und Absteifung."],
      ],
    },
    {
      nummer: "10",
      bezeichnung: "Putz- und Estricharbeiten",
      positionen: [
        ["01A", "Innenputz Kalkzement", "m²", "Kalkzement-Innenputz, einlagig, Dicke 15 mm, Qualitätsstufe Q2."],
        ["02A", "Zementestrich schwimmend", "m²", "Schwimmender Zementestrich, Dicke 6 cm, auf Trenn- und Dämmlage."],
      ],
    },
  ];

  for (const [gi, lg] of katalog.entries()) {
    await prisma.lbGruppe.create({
      data: {
        tenantId: tenant.id,
        nummer: lg.nummer,
        bezeichnung: lg.bezeichnung,
        sortier: gi + 1,
        positionen: {
          create: lg.positionen.map(([nr, stichwort, einheit, langtext], pi) => ({
            nummer: nr,
            stichwort,
            einheit,
            langtext,
            sortier: pi + 1,
          })),
        },
      },
    });
  }
  console.log("Leistungsbuch-Demodaten angelegt.");
}

main().finally(() => prisma.$disconnect());
