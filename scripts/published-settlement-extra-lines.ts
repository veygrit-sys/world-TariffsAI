// The dates are the existing verified windows in data/territory-customs.json.
// The commodity only identifies a non-dutiable ordinary test shipment. No
// national tariff line is inferred from the general duty policy.
export const additionalPublishedSettlementSamples = [
  { country: "BQ", code: "691200", currency: "USD", expression: "0%", treatment: "zero_duty_policy", date: "2026-11-11" },
  { country: "GU", code: "691200", currency: "USD", expression: "0%", treatment: "zero_duty_policy", date: "2026-11-11" },
  { country: "HK", code: "69120000", currency: "HKD", expression: "0%", treatment: "zero_duty_policy", date: "2026-11-11" },
  { country: "MO", code: "69120000", currency: "MOP", expression: "0%", treatment: "zero_duty_policy", date: "2026-11-11" },
  { country: "SX", code: "691200", currency: "XCG", expression: "0%", treatment: "zero_duty_policy", date: "2026-11-11" },
] as const;
