/** Exact ordinary tariff lines observed in official originals on the cycle reference date. */
export interface CycleBaseLine {
  code: string;
  hs6: string;
  currency: string;
  treatment: "general" | "mfn";
  jurisdiction?: string;
  customsValue?: number;
  authority: string;
  termsUrl: string;
  edition: string;
  observedRate: string;
  observedExpression?: string;
  syntheticRate: string;
  scope: string;
}

export interface WorldwideLine extends CycleBaseLine {
  originals: Readonly<Record<string, string>>;
}

export const worldwideBaseLines = {
  GB: {
    code: "6912002310", hs6: "691200", currency: "GBP", treatment: "mfn",
    authority: "HM Revenue & Customs and Department for Business and Trade",
    termsUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    edition: "UK Trade Tariff, stoneware child code and inherited third-country duty (measure type 103)",
    observedRate: "4", syntheticRate: "5",
    scope: "Stoneware tableware. Great Britain only. Third-country ordinary rate with no Japan preference claimed.",
    originals: {
      gb_measures_v4_0_1653: "339f1fc94c7215dcab69ff4f6cbc51be9ada737d00dae5b01473234d0b8c1251",
      gb_commodities_v4_0_1653: "886ffa2aaea43d417fa29e057b7fc2adfafb1d02ddbecb1cd45cce0576a769e0",
    },
  },
  CA: {
    code: "6912009010", hs6: "691200", currency: "CAD", treatment: "mfn",
    authority: "Canada Border Services Agency", termsUrl: "https://www.cbsa-asfc.gc.ca/terms-conditions-avis-eng.html",
    edition: "T2026-2, Chapter 69, 6912.00.90.10",
    observedRate: "7", syntheticRate: "8",
    scope: "Non-porcelain ceramic tableware. Statistical suffix 10 under tariff item 6912.00.90. No CPTPP preference claimed.",
    originals: { ca_cbsa_tariff_t2026_2: "cf7c0fb443c7136a36f62beecd8f7227480b03519e1be8ed913d593d73773807" },
  },
  AU: {
    code: "69120000", hs6: "691200", currency: "AUD", treatment: "general",
    authority: "Australian Border Force", termsUrl: "https://www.abf.gov.au/copyright",
    edition: "Working Tariff Schedule 3, Chapter 69, 6912.00.00",
    observedRate: "5", syntheticRate: "6",
    scope: "Non-porcelain ceramic tableware. General rate. No preference claimed.",
    originals: { au_abf_schedule_3_ch69: "97e8b033226b643f56be36223cc62313e638a5d5f7ce7ed2259190d666c82e87" },
  },
  NZ: {
    code: "6912000102", hs6: "691200", currency: "NZD", treatment: "mfn",
    authority: "New Zealand Customs Service", termsUrl: "https://www.customs.govt.nz/copyright/",
    edition: "CUSMOD tariff 2026-11-13, 6912.00.01 02H, NML",
    observedRate: "5", syntheticRate: "6",
    scope: "Non-porcelain ceramic coffee mugs. Normal tariff. No preference claimed.",
    originals: { nz_customs_cusmod_tariff: "8a87675707d7e8ae19d1367633270e69b93466325c7d0a8731dc1ffb1c297534" },
  },
  TW: {
    code: "69120090006", hs6: "691200", currency: "TWD", treatment: "mfn",
    authority: "Taiwan Ministry of Finance Customs Administration", termsUrl: "https://data.gov.tw/license",
    edition: "Customs import tariff CSV, 6912.00.90.00-6, Column I",
    observedRate: "7.5", syntheticRate: "8",
    scope: "Non-porcelain ceramic soap dish, in other ceramic household and toilet articles.",
    originals: { tw_customs_ccc_csv: "b9d3a7ba23e2ea05a7f379aa9d1bc6a7874dfba81e612c7e7438f4fbac5f43e6" },
  },
  CH: {
    code: "69120000", hs6: "691200", currency: "CHF", treatment: "general",
    authority: "Federal Office for Customs and Border Security", termsUrl: "https://www.bazg.admin.ch/bazg/en/home/the-focbs/terms-and-conditions.html",
    edition: "Swiss customs tariff master data, 6912.0000, normal tariff, valid from 2024-01-01",
    observedRate: "0", observedExpression: "CHF 0 per 100 kg gross", syntheticRate: "1",
    scope: "Non-porcelain ceramic tableware, ordinary zero rate. VAT and fees are separate.",
    originals: { ch_li_edec_tariff_master_data: "61a881560cb3177a855a978e9eeda828f6abbdbc529c5d82b5238e1d8832f124" },
  },
  ZA: {
    code: "691200", hs6: "691200", currency: "ZAR", treatment: "mfn",
    authority: "South African Revenue Service", termsUrl: "https://www.sars.gov.za/terms-and-conditions/",
    edition: "SARS Schedule 1 Part 1 dated 2026-11-13, 6912.00, check digit 6, General",
    observedRate: "30", syntheticRate: "31",
    scope: "Non-porcelain ceramic tableware. SACU schedule General column, tested for South African import only.",
    originals: { sacu_sars_common_external_tariff: "68e9acf6131b73a90d3dd88c3a092fa5726aa93ecb1653629a850621c1f90795" },
  },
  MX: {
    code: "6912009901", hs6: "691200", currency: "MXN", treatment: "mfn",
    authority: "Mexico Secretaría de Economía, SNICE", termsUrl: "https://www.snice.gob.mx/",
    edition: "2026-10-14 LIGIE and NICO, 6912.00.99 / 01",
    observedRate: "15", syntheticRate: "16",
    scope: "Other non-porcelain ceramic tableware, excluding Talavera. Japanese origin, no preference claimed.",
    originals: { mx_snice_ligie_20261014: "3cf7a24f9cd8661176d401b6b314488d1b7f1368875d6434703821b06f6ccae6" },
  },
  CL: {
    code: "69120010", hs6: "691200", currency: "CLP", treatment: "general",
    authority: "Servicio Nacional de Aduanas de Chile", termsUrl: "https://www.aduana.cl/",
    edition: "Arancel Aduanero, Arancel Ad. 2023 sheet row 9956, 6912.0010",
    observedRate: "6", syntheticRate: "7",
    scope: "Stoneware tableware. General tariff with no Japan preference claimed.",
    originals: { cl_aduanas_arancel: "17daf6000af21a0a3537b9b594dd2831a29846ee7761b36ea68ef6ad52a24849" },
  },
  DE: {
    code: "69120023", hs6: "691200", currency: "EUR", treatment: "mfn", jurisdiction: "EU",
    authority: "European Commission, Official Journal of the European Union",
    termsUrl: "https://eur-lex.europa.eu/content/legal-notice/legal-notice.html",
    edition: "EU 2026 Combined Nomenclature, Regulation (EU) 2025/1926, CN 6912 00 23",
    observedRate: "5.5", syntheticRate: "6",
    scope: "Stoneware tableware. Annual CN conventional duty, tested for German import. Declaration and any preference require separate TARIC review.",
    originals: { eu_cct_2026: "a196e15eaa142907e368fa430eb4479a50b08baf27002c43a55d5905a3bc84b2" },
  },
  SG: {
    code: "69120000", hs6: "691200", currency: "SGD", treatment: "general",
    authority: "Singapore Customs and the Singapore Government Gazette", termsUrl: "https://sso.agc.gov.sg/Terms-Of-Use",
    edition: "Customs (Duties) Order 2022, First Schedule, 6912.00.00 and amendments through November 2026",
    observedRate: "0", syntheticRate: "1",
    scope: "Non-porcelain ceramic tableware. Outside the dutiable categories. Import GST is separate.",
    originals: {
      sg_customs_duties_order_gazettes_sg_s483_2022: "d25f2d4279bb36645db00332d10e1f5ae41eae00d85513b991481f681d86613d",
      sg_customs_duties_order_gazettes_sg_s1036_2022: "76ea1007ee33140c8f615893a70577a2b5c8969cf2d0e28cd24f39b67403e694",
      sg_customs_duties_order_gazettes_sg_s789_2022: "45859a8dede970fee026d7c8833493edb28d2e2823c65c0cb4bc767027f76a69",
      sg_customs_duties_order_gazettes_sg_s067_2023: "2a2ba8d4e2b2aeeb7067dddf26370b788a7a7d29abd2ff9b6f1b41410cc3344c",
      sg_customs_duties_order_gazettes_sg_s274_2025: "a2d474ae3807fa281ab1f85db7152fc97ce96a289b8ee0212a611d76db783bcb",
      sg_customs_duties_order_gazettes_sg_s323_2025: "4f9c54dbf9a91f13cdef1e4710bc0768c2a526b39d16ada850bd6b14938d2ba3",
      sg_customs_duties_order_gazettes_sg_s049_2026: "f1d488721e62aeb721bfafd98cd941b19de0f42b103b033dbbb9e590a0eaae7f",
      sg_customs_duties_order_gazettes_sg_s067_2026: "c4356551e13e7c3b1c8b7d33c98b99ec0a50729b2763cbb0317c1157e47e515c",
      sg_customs_duties_order_gazettes_sg_s785_2026: "174b2c1f4f932ae07d20a741ee3ef6784139719955df1a44cb8387e2485e2809",
      sg_customs_duties_order_gazettes_sg_s809_2026: "4516b24bb3620e773006dbe82c45f27416b251e84c347435dfce97036ecb66e2",
    },
  },
} as const satisfies Record<string, WorldwideLine>;

export const worldwideCountries = Object.keys(worldwideBaseLines);
export const worldwideRoutes = [
  ...worldwideCountries.map((country) => "JP-" + country),
  ...worldwideCountries.map((country) => country + "-JP"),
];
