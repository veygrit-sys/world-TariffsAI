import { worldwideBaseLines, type WorldwideLine } from "./worldwide-cycle-lines.ts";

const additionalEuCountries = [
  "AT", "BE", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
];
const additionalEuLines = Object.fromEntries(additionalEuCountries.map((country) => [country, {
  ...worldwideBaseLines.DE,
  scope: "Stoneware tableware in standard EU customs territory, using EUR for the test. Annual CN conventional duty. Actual declaration and preferences require separate TARIC review.",
}]));

const reviewedNationalLines: Record<string, WorldwideLine> = {
  "AL": {
    "code": "69120023",
    "hs6": "691200",
    "currency": "ALL",
    "treatment": "general",
    "authority": "Albanian Customs",
    "termsUrl": "https://dogana.gov.al/english/d/182/248/0/231/combined-nomenclature-of-goods",
    "edition": "2026 Combined Nomenclature, 6912 00 23",
    "observedRate": "15",
    "syntheticRate": "16",
    "scope": "Stoneware tableware, basic customs duty with no preference claimed.",
    "originals": {
      "al_tariff_2026": "30d4a16cc998db4a0e6f3c95770bbdb66ce9ab8e826aa7d47fe790d902066815"
    }
  },
  "BD": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "BDT",
    "treatment": "general",
    "authority": "Bangladesh National Board of Revenue",
    "termsUrl": "https://nbr.gov.bd/budget/tariff-schedule/uploads",
    "edition": "Bangladesh Customs Tariff FY 2026–27, Chapter 69, PDF p.2, 6912.00.00",
    "observedRate": "25",
    "syntheticRate": "26",
    "scope": "Ceramic tableware and kitchenware other than porcelain/china. Ordinary statutory customs duty; operative levies and exemptions are separate.",
    "originals": {
      "bd_nbr_first_schedule_69": "53f90b617c47762757ec4a98230f86c00149e3bdf1eb91677c910b1adc193bd8"
    },
    "customsValue": 300000
  },
  "BM": {
    "code": "6912001",
    "hs6": "691200",
    "currency": "BMD",
    "treatment": "general",
    "authority": "Government of Bermuda, Customs Department",
    "termsUrl": "https://www.gov.bm/schedules-customs-tariff-act-1970",
    "edition": "Customs Tariff Act 1970, First Schedule 2026 edition updated through 2026-04-01",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Ceramic tableware and kitchenware other than porcelain or china. General import duty zero for 6912.001, other goods and charges separate.",
    "originals": {
      "bm_customs_tariff_first_schedule_2026": "b63668946da916bc7dffd4eb0ea0dbfb6a4594e83c2b5dc1aba55f643eb3da54",
      "bm_customs_tariff_second_seventh_2026": "f937adb8e406cdb5dd471bbdf0a8731bc9dc52597fdc6fe4408402b20de07f29"
    }
  },
  "BN": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "BND",
    "treatment": "general",
    "authority": "Brunei Royal Customs and Excise Department",
    "termsUrl": "https://www.customs.gov.bn/ref-rced/",
    "edition": "BDTTC 2022, PDF p.303, 6912.00.00",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware or kitchenware. Ordinary import duty is Nil. The RCED amendment list of 17 May 2023 and the 2026 notices do not change this line.",
    "originals": {
      "bn_rced_bdttc_2022": "a740c17d76b29e0a9ad5686f6bd7c6db7f5672393b847816ce0979328c575045"
    }
  },
  "BR": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "BRL",
    "treatment": "mfn",
    "authority": "Brazil Ministry of Development, Industry, Trade and Services",
    "termsUrl": "https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html",
    "edition": "Resolução Gecex 272 workbook dated 2026-11-11, Anexo II, row 6763, Alíquota aplicada",
    "observedRate": "18",
    "syntheticRate": "19",
    "scope": "Non-porcelain ceramic tableware. Brazilian applied ordinary duty; the Annex I regional baseline is separate. No preference claimed.",
    "originals": {
      "br_mdic_gecex_272": "dd33ad822566d9083f210cc873d278da266425fd734a3008fc1fd27b68f948ef"
    }
  },
  "BW": {
    "code": "691200",
    "hs6": "691200",
    "currency": "BWP",
    "treatment": "mfn",
    "authority": "South African Revenue Service and Southern African Customs Union",
    "termsUrl": "https://www.sars.gov.za/terms-and-conditions/",
    "edition": "SACU Common External Tariff, SARS Schedule 1 Part 1 dated 2026-11-13, 6912.00, check digit 6, General",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Non-porcelain ceramic tableware. Ordinary SACU common external tariff baseline for entry into Botswana from outside the union, pursuant to Article 20. National declaration digits and other charges are separate.",
    "originals": {
      "sacu_sars_common_external_tariff": "68e9acf6131b73a90d3dd88c3a092fa5726aa93ecb1653629a850621c1f90795"
    },
    "jurisdiction": "SACU"
  },
  "BZ": {
    "code": "6912001000",
    "hs6": "691200",
    "currency": "BZD",
    "treatment": "mfn",
    "authority": "Belize Customs and Excise Department",
    "termsUrl": "https://www.nationalassembly.gov.bz/wp-content/uploads/2023/01/Act-No.-1-of-2023-Customs-and-Excise-Amendment.pdf",
    "edition": "Tariff and Trade Classification, First Schedule Chapter 69, MFN column, official current index observed 2026-11-13",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware and kitchenware. Ordinary MFN rate with no preference. RRD, GST and other charges are separate.",
    "originals": {
      "bz_customs_first_schedule_069": "7048690c9193d38f5817d7a745c1104c7c797bcc598914cbeabf3565055d069d"
    }
  },
  "CI": {
    "code": "6912001000",
    "hs6": "691200",
    "currency": "XOF",
    "treatment": "mfn",
    "authority": "Direction générale des douanes de Côte d’Ivoire",
    "termsUrl": "https://www.wipo.int/wipolex/fr/legislation/details/16840",
    "edition": "TEC CEDEAO 2022 version SYDAM World 2026-03-27, line 3909, DD column",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware, selected in the Ivorian tariff with the ordinary DD duty. Other taxes and preferences are separate.",
    "originals": {
      "ci_sydam_tariff_2026": "420576635c74ce94ae3c8e09e393704a215f02c74e4d304cb2b0f90184a4187c"
    },
    "customsValue": 500000
  },
  "CO": {
    "code": "6912000000",
    "hs6": "691200",
    "currency": "COP",
    "treatment": "mfn",
    "authority": "Dirección de Impuestos y Aduanas Nacionales de Colombia",
    "termsUrl": "https://cancilleria.gov.co/normograma/compilacion/docs/ley_0023_1982.htm",
    "edition": "DIAN current consolidated Decreto 1881 de 2021, Article 1, 6912.00.00.00",
    "observedRate": "15",
    "syntheticRate": "16",
    "scope": "Non-porcelain ceramic tableware. National ordinary duty; selected row has no temporary rate annotation. No preference claimed.",
    "originals": {
      "co_dian_decreto_1881": "ad88ac034e170a64a723bfadb33dbb6c6c06bed01c77fbc0a1db5bb12885bd61"
    },
    "customsValue": 1500000
  },
  "EC": {
    "code": "6912000000",
    "hs6": "691200",
    "currency": "USD",
    "treatment": "mfn",
    "authority": "Comité de Comercio Exterior and Servicio Nacional de Aduana del Ecuador",
    "termsUrl": "https://www.derechosintelectuales.gob.ec/wp-content/uploads/downloads/2021/agosto/a_2_16_codigo_ingenios_agosto_2021.pdf",
    "edition": "COMEX Resoluciones 002-2023 and 011-2023, national ad valorem column",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Non-porcelain ceramic tableware. Standard import in the national base schedule with no preference claimed. Courier regimes and other charges are separate.",
    "originals": {
      "ec_comex_002_2023": "7231d3443744204348b33acb7c6be7cdc43e4920d2ffba47aff87108d32dbb1d",
      "ec_comex_011_2023": "f5f0d9f15414bf6664cab805d490735a73c00d854a785992bac748ab16f52e99"
    }
  },
  "FJ": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "FJD",
    "treatment": "general",
    "authority": "Fiji Revenue and Customs Service",
    "termsUrl": "https://www.wipo.int/wipolex/en/text/591141",
    "edition": "Fiji Standard Tariff HS 2022 with 2026/27 National Budget amendments, 6912.00.00 Fiscal",
    "observedRate": "5",
    "syntheticRate": "6",
    "scope": "Non-porcelain ceramic tableware. Standard tariff fiscal duty only. Other charges and preferences are separate.",
    "originals": {
      "fj_frcs_hs_2026_27_budget": "de8eb0fbb02418feb017cb646107d7f9515ff02e3b9d99066a6be964c8f5efff"
    }
  },
  "HK": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "HKD",
    "treatment": "general",
    "authority": "Hong Kong Customs and Excise Department / Census and Statistics Department",
    "termsUrl": "https://www.customs.gov.hk/en/home/index.html",
    "edition": "Hong Kong Customs free-port cargo rules and HKHS 2026, HsItem 69120000",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware. Hong Kong Customs levies no ordinary customs tariff. The exact classification comes from the 2026 HKHS workbook; excise goods are separate.",
    "originals": {
      "hk_customs_free_port": "dd16f1f36a3d43215e043b07f3841107572c0419d0c8636fda9f837a0204743a",
      "hk_censtatd_hkhs_2026": "ac459eca445261f9e291120f323fedd3e14e95fc5c4af168082f641b64808d73"
    }
  },
  "ID": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "IDR",
    "treatment": "general",
    "authority": "Indonesia Ministry of Finance (JDIH)",
    "termsUrl": "https://jdih.kemenkeu.go.id/dok/26-pmk-010-2022",
    "edition": "BTKI 2022, PMK 26/2022 Annex III PDF p.454 row 6060; amendments through PMK 68/2026",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Ceramic tableware or kitchenware other than porcelain/china. Later PMK 62/2025 and PMK 50/2026 retain this line; PMK 10/2024 and 68/2026 do not change it. No preferential rate claimed.",
    "originals": {
      "id_jdih_btki_2022_amendments_id_26": "ae0caa3d9f49fbdd3378af0ff4cbf84350cfe29f28ef767d07e2a063bf5e1fd6",
      "id_jdih_btki_2022_amendments_id_50": "31d89a89d01af2e90da1e06d9a75a84f5eaede6fa59123fbec973e018b1e940f",
      "id_jdih_btki_2022_amendments_id_62": "87b58a44df61e2f78dfa950294043659b7b747305b08f21a16e9130a0ed8022b",
      "id_jdih_btki_2022_amendments_id_68": "5a60d7b21f8ee936a675b1a6e97e589bda321d9cf9ab1b6eb5a684a50d6c69e7",
      "id_jdih_btki_2022_amendments_id_10": "64e06248fde98c13cc311f8afd97bd2b9a3e7e491623b1b3c79e4dcd3360eb43"
    },
    "customsValue": 3000000
  },
  "IS": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "ISK",
    "treatment": "general",
    "authority": "Iceland Revenue and Customs, Skatturinn",
    "termsUrl": "https://www.skatturinn.is/english/",
    "edition": "TSKINN01102026, ordinary A duty, 6912.0000",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware, zero ordinary customs duty. VAT and any other charges are separate.",
    "originals": {
      "is_import_tariff_keys_20261001": "65466de4a4a4b08da025187c8f1202f307ab0469ae32cc0ffc394a2010e3d7b5"
    }
  },
  "JM": {
    "code": "6912001000",
    "hs6": "691200",
    "currency": "JMD",
    "treatment": "general",
    "authority": "Jamaica Customs Agency",
    "termsUrl": "https://laws.moj.gov.jm/library/statute/the-copyright-act",
    "edition": "Integrated Tariff based on HS 2022, 2026-10-30, ID 01",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware and kitchenware. Ordinary ID 01 import duty only; other levies are separate.",
    "originals": {
      "jm_jca_integrated_tariff_20261030": "09f8d5e8167b21b870584e3957f4338b70368a751b583c99a978c023b898d736"
    }
  },
  "KR": {
    "code": "6912003000",
    "hs6": "691200",
    "currency": "KRW",
    "treatment": "general",
    "authority": "Korea Customs Service",
    "termsUrl": "https://www.data.go.kr/data/15051179/fileData.do",
    "edition": "KCS 2026 HSK workbook 20260211, sheet 2.12, 6912003000, class A",
    "observedRate": "8",
    "syntheticRate": "9",
    "scope": "Non-porcelain ceramic toilet articles such as a soap dish. Korea Customs Service A General 8%; WTO concession C 16% is higher, and RCEP 4% is a separate preference not claimed. UNI-PASS confirms the line's 2026 validity.",
    "originals": {
      "kr_kcs_annual_rates_2026": "be4450bab5dad09a6b8278371f3c078e54ac899aa098212bd09124bfd46407c4"
    },
    "customsValue": 1500000
  },
  "KY": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "KYD",
    "treatment": "general",
    "authority": "Cayman Islands Attorney General and Customs and Border Control",
    "termsUrl": "https://legislation.gov.ky/cms/legislation/index/alphabetical.html",
    "edition": "Customs Tariff Act 2026 Revision, Schedule 1, Chapter 69",
    "observedRate": "12",
    "syntheticRate": "13",
    "scope": "Non-porcelain ceramic tableware, for standard import into Grand Cayman. Cayman Brac and Little Cayman waivers are separate. The July 2026 amendment affects Schedule 2 only.",
    "originals": {
      "ky_customs_tariff_act_2026": "2c7abbac2a01f3191a7cb6e65d996e838c76b7773f730f4d6b44a30c2ed06dc4"
    }
  },
  "LC": {
    "code": "6912001000",
    "hs6": "691200",
    "currency": "XCD",
    "treatment": "general",
    "authority": "Government of Saint Lucia and Export Saint Lucia",
    "termsUrl": "https://exportsaintlucia.org/harmonized-system-tariff-schedule/",
    "edition": "Statutory Instrument 151 of 2025, Schedule 4 effective 2025-11-01",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware and kitchenware. Nationally enacted CARICOM standard import duty, outside preferential treatment.",
    "originals": {
      "lc_customs_order_151_2025": "d0c144832113a7711051e2ec873b741889634738676d99dd90b2be75ad1d851a"
    }
  },
  "LK": {
    "code": "39261090",
    "hs6": "392610",
    "currency": "LKR",
    "treatment": "general",
    "authority": "Sri Lanka Customs",
    "termsUrl": "https://www.customs.gov.lk/customs-tariff/import-tariff/",
    "edition": "Sri Lanka Customs Tariff Guide 03.11.2026, Chapter 39 PDF p.14, 3926.10.90",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Other plastic office or school supplies, e.g. an ordinary molded plastic desk file divider. General Duty 20% in the named column. VAT, PAL, Cess, SSCL, preference, and operative Gazette changes are separate.",
    "originals": {
      "lk_customs_import_tariff_2026_11_03": "7cf233d58beeec1c66d6319e6f55a72f8d5cfba1da7da8c96f29f9e788e1ed10"
    }
  },
  "LS": {
    "code": "691200",
    "hs6": "691200",
    "currency": "LSL",
    "treatment": "mfn",
    "authority": "South African Revenue Service and Southern African Customs Union",
    "termsUrl": "https://www.sars.gov.za/terms-and-conditions/",
    "edition": "SACU Common External Tariff, SARS Schedule 1 Part 1 dated 2026-11-13, 6912.00, check digit 6, General",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Non-porcelain ceramic tableware. Ordinary SACU common external tariff baseline for entry into Lesotho from outside the union, pursuant to Article 20. National declaration digits and other charges are separate.",
    "originals": {
      "sacu_sars_common_external_tariff": "68e9acf6131b73a90d3dd88c3a092fa5726aa93ecb1653629a850621c1f90795"
    },
    "jurisdiction": "SACU"
  },
  "MG": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "MGA",
    "treatment": "general",
    "authority": "Direction générale des douanes de Madagascar",
    "termsUrl": "https://www.douanes.gov.mg/tarifs-des-douanes/",
    "edition": "Tarif des douanes 2026 après LFR 2026, Chapter 69, DD column",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware. Ordinary national import duty; VAT is separate.",
    "originals": {
      "mg_douanes_2026_lfr": "9f26e514d5bbbb69e3c45082b49694bb39378c983a975568a46490c02b326e5f"
    },
    "customsValue": 2000000
  },
  "MK": {
    "code": "6912002300",
    "hs6": "691200",
    "currency": "MKD",
    "treatment": "general",
    "authority": "Customs Administration of North Macedonia",
    "termsUrl": "https://www.customs.gov.mk/en-GB/pocetna/e-carina/nkts/carinska-tarifa.nspx",
    "edition": "2026 Customs Tariff workbook, row 10258, 6912 00 23 00",
    "observedRate": "15",
    "syntheticRate": "16",
    "scope": "Stoneware tableware; national duty. Selected line was not among the July 2026 amendments.",
    "originals": {
      "mk_tariff_2026": "c25a7f36621f4a9e21784ec0d846e2f2a8380cd74d852e469e47c16afb141b6b"
    }
  },
  "MM": {
    "code": "6912000000",
    "hs6": "691200",
    "currency": "MMK",
    "treatment": "mfn",
    "authority": "Myanmar Customs Department, Ministry of Planning and Finance",
    "termsUrl": "https://www.customs.gov.mm/",
    "edition": "Myanmar Customs Tariff 2022, PDF p.455, 6912.00.00.00",
    "observedRate": "3",
    "syntheticRate": "4",
    "scope": "Non-porcelain ceramic tableware. Myanmar's National Trade Portal identifies the 2022 customs tariff as the ordinary base. Trade controls, separate taxes and preferential rates require separate review.",
    "originals": {
      "mm_customs_tariff_2022": "bdd56fbd9b109c11ae6becedc192bb9bfcb4f37c3831914796dc038716306209"
    }
  },
  "MO": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "MOP",
    "treatment": "general",
    "authority": "Macao SAR Commerce and Investment Promotion Institute / Statistics and Census Service",
    "termsUrl": "https://www.ipim.gov.mo/en/invest-here/foreign-trade",
    "edition": "Macao free-port rule and NCEM/HS 7th Revision PDF p.501, 6912.00.00",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware. Ordinary import duty under the Macao free-port rule. Consumption tax applies to specified tobacco and alcohol, separate from this item.",
    "originals": {
      "mo_official_free_port": "2ce0c27081dfb73dbc3a0684325f1655bc5941165876c098defc9da98606325f",
      "mo_dsec_ncem_7th_revision": "e4f5ebcdafbe6412adb7da93f07038da6a799a80e46e77db97e391d002ccd280"
    }
  },
  "MU": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "MUR",
    "treatment": "general",
    "authority": "Mauritius Revenue Authority Customs Department",
    "termsUrl": "https://www.wipo.int/wipolex/en/legislation/details/15447",
    "edition": "MRA Integrated Tariff as at 2026-10-01, First Schedule, 6912.00.00",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware. General customs duty zero. VAT is separate. Published MRA schedule baseline.",
    "originals": {
      "mu_mra_integrated_tariff_2026": "c631ca50bfe4d5e8117983c35822af2dca858aa19285f5ce7d25de23141b035a"
    }
  },
  "NA": {
    "code": "691200",
    "hs6": "691200",
    "currency": "NAD",
    "treatment": "mfn",
    "authority": "South African Revenue Service and Southern African Customs Union",
    "termsUrl": "https://www.sars.gov.za/terms-and-conditions/",
    "edition": "SACU Common External Tariff, SARS Schedule 1 Part 1 dated 2026-11-13, 6912.00, check digit 6, General",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Non-porcelain ceramic tableware. Ordinary SACU common external tariff baseline for entry into Namibia from outside the union, pursuant to Article 20. National declaration digits and other charges are separate.",
    "originals": {
      "sacu_sars_common_external_tariff": "68e9acf6131b73a90d3dd88c3a092fa5726aa93ecb1653629a850621c1f90795"
    },
    "jurisdiction": "SACU"
  },
  "NO": {
    "code": "69120090",
    "hs6": "691200",
    "currency": "NOK",
    "treatment": "general",
    "authority": "Norwegian Customs, Tolletaten",
    "termsUrl": "https://lovdata.no/dokument/SF/forskrift/2025-12-16-2594",
    "edition": "2026 Tolltariff, chapter 69 p. 69-3, 69.12 .0090",
    "observedRate": "0",
    "syntheticRate": "1",
    "scope": "Non-porcelain ceramic tableware other than white-mass earthenware, ordinary duty zero. The statutory zero is represented as 0% for test arithmetic.",
    "originals": {
      "no_tariff_2026_lovtidend": "10419b7fe4cfa937036ae00813fdc59fe51f4e95f02d50284db8fa7f85ce6cd5"
    }
  },
  "NP": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "NPR",
    "treatment": "general",
    "authority": "Nepal Department of Customs, Ministry of Finance",
    "termsUrl": "https://customs.gov.np/content/46/integrated-tariff-rate/",
    "edition": "Nepal integrated import tariff FY 2083/84, PDF p.360, 6912.00.00",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware. Ordinary customs duty column for other origins, excluding SAARC preferences, VAT and combined rate.",
    "originals": {
      "np_integrated_tariff_2083_84": "0569e39916b8bf2878913b49e490b2a81586969e0c3baf34d2580d4d212f12e3"
    }
  },
  "OM": {
    "code": "691200000004",
    "hs6": "691200",
    "currency": "OMR",
    "treatment": "general",
    "authority": "Royal Oman Police, Directorate General of Customs",
    "termsUrl": "https://www.wipo.int/wipolex/en/legislation/details/5832",
    "edition": "Oman Customs Tariff 2026, valid from 2026-01-01, 69 12 00 00 00 04",
    "observedRate": "5",
    "syntheticRate": "6",
    "scope": "Ceramic dishes and trays other than porcelain or china. Oman twelve-digit tariff line; no preference claimed.",
    "originals": {
      "om_tariff_2026_pdf": "ea3be328e3d33813dd1b863a0e3b126b2e23edfea4678d6b31061b3a966d8a51"
    }
  },
  "PE": {
    "code": "6912000000",
    "hs6": "691200",
    "currency": "PEN",
    "treatment": "mfn",
    "authority": "SUNAT and Ministerio de Economía y Finanzas del Perú",
    "termsUrl": "https://cdn.www.gob.pe/uploads/document/file/1669698/DL%20822.pdf.pdf",
    "edition": "Arancel de Aduanas 2022, Decretos Supremos 404-2021-EF, 163-2022-EF and 194-2022-EF",
    "observedRate": "6",
    "syntheticRate": "7",
    "scope": "Non-porcelain ceramic tableware. National ordinary A/V column. No Peru-Japan EPA or CPTPP preference claimed.",
    "originals": {
      "pe_sunat_arancel_2022": "f5e17dc6c96792d373623926d8d9ec440df600b27ae59abc03bd554152e6f6e3",
      "pe_sunat_ds163_2022": "c202ad49893400b847f4d9affa0f31e74b0c1d985f1f49a8eda531372d2449af",
      "pe_mef_ds194_2022": "9600bf5ff0c0c94ef08a5ff8197fe274fe947f95fb7eb2123359b41ae22732bd"
    }
  },
  "PH": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "PHP",
    "treatment": "mfn",
    "authority": "Philippine Tariff Commission",
    "termsUrl": "https://finder.tariffcommission.gov.ph/",
    "edition": "Philippine Tariff Finder, active 2026 MFN JSON, item 9124, 6912.00.00",
    "observedRate": "15",
    "syntheticRate": "16",
    "scope": "Non-porcelain ceramic tableware. MFN tariff only. The rate is tied to year 2026 and item 9124; no agreement-specific preference claimed.",
    "originals": {
      "ph_tc_tariff_finder_2026_69120000": "e99eac40241300368f0ff327041692fc36074abee9209f325d63a218eabe3d73"
    },
    "customsValue": 25000
  },
  "PK": {
    "code": "69120010",
    "hs6": "691200",
    "currency": "PKR",
    "treatment": "general",
    "authority": "Pakistan Federal Board of Revenue",
    "termsUrl": "https://www.fbr.gov.pk/categ/laws/144",
    "edition": "Pakistan Customs Tariff FY 2026–27 First Schedule, PDF p.171, 6912.0010",
    "observedRate": "20",
    "syntheticRate": "21",
    "scope": "Non-porcelain ceramic tableware and kitchenware. Ordinary first-schedule customs duty only. Additional and regulatory duties are separate.",
    "originals": {
      "pk_fbr_first_schedule_2026_27": "62848bdc97f16211e2528279ca2b4ebeef2689d6316557ad8c0180683e9af066"
    },
    "customsValue": 300000
  },
  "RS": {
    "code": "6912002300",
    "hs6": "691200",
    "currency": "RSD",
    "treatment": "general",
    "authority": "Customs Administration of Serbia",
    "termsUrl": "https://www.carina.rs/en/business-community/CustomsTariff.html",
    "edition": "2026 national tariff 107/25 and 45/26, p. 1137, 6912 00 23 00",
    "observedRate": "8",
    "syntheticRate": "9",
    "scope": "Stoneware tableware, statutory ordinary rate with no preference claimed. On the reverse lane the Japan Customs Association tariff-application table lists the bilateral MFN treaty-rate column (no GSP preference claimed).",
    "originals": {
      "rs_tariff_2026_consolidated": "68ad3257b230e60c1db36125de1f8d4a2e50a26936dfdbbd216253c38cf4e7ae"
    }
  },
  "SZ": {
    "code": "691200",
    "hs6": "691200",
    "currency": "SZL",
    "treatment": "mfn",
    "authority": "South African Revenue Service and Southern African Customs Union",
    "termsUrl": "https://www.sars.gov.za/terms-and-conditions/",
    "edition": "SACU Common External Tariff, SARS Schedule 1 Part 1 dated 2026-11-13, 6912.00, check digit 6, General",
    "observedRate": "30",
    "syntheticRate": "31",
    "scope": "Non-porcelain ceramic tableware. Ordinary SACU common external tariff baseline for entry into Eswatini from outside the union, pursuant to Article 20. National declaration digits and other charges are separate.",
    "originals": {
      "sacu_sars_common_external_tariff": "68e9acf6131b73a90d3dd88c3a092fa5726aa93ecb1653629a850621c1f90795"
    },
    "jurisdiction": "SACU"
  },
  "TR": {
    "code": "691200230000",
    "hs6": "691200",
    "currency": "TRY",
    "treatment": "general",
    "authority": "Republic of Türkiye Ministry of Trade",
    "termsUrl": "https://ticaret.gov.tr/",
    "edition": "2026 Decision 3350, List II sheet 69 row 68, DÜ column",
    "observedRate": "5.5",
    "syntheticRate": "6.5",
    "scope": "Stoneware tableware, other-country base rate. Decision 3351, Annex 1 row 2323 contains a separate 25% column with footnote 2 and requires applicability review.",
    "originals": {
      "tr_import_regime_annexes_2026": "64d1f61526ac670afd044a3ee7357cf339b616b78f729e8accbd563f95e66c7e",
      "tr_additional_customs_duty_annexes_2026": "ac2731d9f5e01ad2189e057fad54ea2ccacf64527dd3fc14a9944500093ad36b"
    },
    "customsValue": 100000
  },
  "VN": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "VND",
    "treatment": "mfn",
    "authority": "Government of Vietnam",
    "termsUrl": "https://vanban.chinhphu.vn/?docid=208020&pageid=27160",
    "edition": "Decree 26/2023/ND-CP Appendix II, PDF p.4 (printed p.444), 6912.00.00",
    "observedRate": "35",
    "syntheticRate": "36",
    "scope": "Non-porcelain ceramic tableware. MFN import duty. The consolidated 2026 Chapter 69 publication corroborates the same base rate; special FTA rates are separate.",
    "originals": {
      "vn_decree_26_2023_appendix": "5973990290425fcc1fecc86be0e548377f2c50660a8cd29cc88350233c6e9804",
      "vn_decree_26_2023_text": "fcf6b1709f90c5b6f28b7d0318560e39fde894b0f32e6e8d8e36068610c10043"
    },
    "customsValue": 20000000
  },
  "VU": {
    "code": "69120000",
    "hs6": "691200",
    "currency": "VUV",
    "treatment": "general",
    "authority": "Vanuatu Department of Customs and Inland Revenue",
    "termsUrl": "https://www.wipo.int/wipolex/en/text/475492",
    "edition": "Customs Tariff, HS2022 English version V4, Schedule 1, Import Duty",
    "observedRate": "15",
    "syntheticRate": "16",
    "scope": "Non-porcelain ceramic tableware. Ordinary national import duty; VAT and declaration fee are separate.",
    "originals": {
      "vu_customs_tariff_hs2022_v4": "192d001c6723dce020370af773f6e8145fdddbb8ab1c59323499603e4d8bc4fe"
    }
  },
  "WS": {
    "code": "69120010",
    "hs6": "691200",
    "currency": "WST",
    "treatment": "general",
    "authority": "Samoa Ministry of Customs and Revenue",
    "termsUrl": "https://customs.gov.ws/rates/",
    "edition": "Current official Customs Tariff Manual, Chapters 61–74, 6912.0010",
    "observedRate": "8",
    "syntheticRate": "9",
    "scope": "Non-porcelain ceramic tableware and kitchenware. Ordinary import duty, excluding preferential rates and VAGST.",
    "originals": {
      "ws_customs_tariff_61_74": "6aab5decd17aa386f4e48ae9da62383f032d9c9203b5850d962acf682d1d645c"
    }
  },
  "XK": {
    "code": "6912002300",
    "hs6": "691200",
    "currency": "EUR",
    "treatment": "general",
    "authority": "Kosovo Customs",
    "termsUrl": "https://dogana.rks-gov.net/",
    "edition": "Integrated Tariff of Kosovo 2026, Section XIII Chapter 69, 6912 0023 00",
    "observedRate": "10",
    "syntheticRate": "11",
    "scope": "Stoneware tableware, statutory ordinary rate with no preference claimed. On the reverse lane the Japan Customs Association tariff-application table lists the bilateral MFN treaty-rate column (no GSP preference claimed).",
    "originals": {
      "xk_tarik_2026": "9cf16a387da604c2bb106fd57d0eb6695a8c34c3efa415d0d4d48c80564bca12"
    }
  }
};
export const additionalCycleLines: Record<string, WorldwideLine> = {
  ...additionalEuLines,
  LI: {
    ...worldwideBaseLines.CH, jurisdiction: "CH",
    scope: "Swiss customs territory by the Swiss–Liechtenstein customs treaty. Non-porcelain ceramic tableware. Import VAT and fees are separate.",
  },
  ...reviewedNationalLines,
};
