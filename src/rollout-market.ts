/**
 * Destination groups for rollout sequencing. The UN M49 geographic table supplies
 * the regions. TW and XK are Veygrit registry assignments, informed by the M49 FAQ.
 * https://unstats.un.org/unsd/methodology/m49/overview
 * https://unstats.un.org/unsd/methodology/m49/#faq
 */
const assignments = [
  [2, "asia",
    "AF BD BN BT CN HK ID IN IR JP KG KH KP KR KZ LA LK MM MN MO MV MY NP PH " +
    "PK SG TH TJ TL TM TW UZ VN",
  ],
  [3, "europe",
    "AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE " +
    "IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK " +
    "SM UA VA XK",
  ],
  [4, "americas",
    "AG AI AR AW BB BL BM BO BQ BR BS BV BZ CA CL CO CR CU CW DM DO EC FK GD " +
    "GF GL GP GS GT GY HN HT JM KN KY LC MF MQ MS MX NI PA PE PM PR PY SR SV " +
    "SX TC TT US UY VC VE VG VI",
  ],
  [5, "western_asia_africa",
    "AE AM AO AZ BF BH BI BJ BW CD CF CG CI CM CV CY DJ DZ EG EH ER ET GA GE " +
    "GH GM GN GQ GW IL IO IQ JO KE KM KW LB LR LS LY MA MG ML MR MU MW MZ NA " +
    "NE NG OM PS QA RE RW SA SC SD SH SL SN SO SS ST SY SZ TD TF TG TN TR TZ " +
    "UG YE YT ZA ZM ZW",
  ],
  [6, "oceania_remote",
    "AS AU CC CK CX FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO " +
    "TV UM VU WF WS",
  ],
] as const;

export type RolloutMarket = Readonly<{
  pass: (typeof assignments)[number][0];
  group: (typeof assignments)[number][1];
}>;

const marketsByCountry = new Map<string, RolloutMarket>();
for (const [pass, group, codes] of assignments) {
  const market = Object.freeze({ pass, group });
  for (const code of codes.split(" ")) {
    if (marketsByCountry.has(code)) throw new Error("DUPLICATE_ROLLOUT_MARKET: " + code);
    marketsByCountry.set(code, market);
  }
}

export function rolloutMarket(destinationCountry: string): RolloutMarket | null {
  return marketsByCountry.get(destinationCountry) ?? null;
}
