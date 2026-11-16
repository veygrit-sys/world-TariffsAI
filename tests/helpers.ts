import type { Shipment } from "../src/types.ts";
import { loadDataset } from "../src/dataset.ts";
export const data = loadDataset();
export const now = new Date("2026-11-11T00:00:00Z");
export function shipment(change: Partial<Shipment> = {}): Shipment {
  return {
    originCountry: "JP",
    destinationCountry: "GB",
    originZone: "standard",
    destinationZone: "standard",
    importDate: "2026-11-11",
    locale: "en",
    currency: "GBP",
    freight: "10.00",
    insurance: "0.00",
    items: [
      {
        id: "line1",
        description: "Synthetic ordinary item",
        quantity: 1,
        unitValue: "100.00",
        originCountry: "JP",
        goodsType: "ordinary",
        standardTaxConfirmed: true,
        classificationConfirmed: true,
        hs6: "691200",
        nonDutiableConfirmed: true,
        japanReliefEligibility: "eligible",
        productIdentifier: "SYNTHETIC-001",
      },
    ],
    transaction: "b2c_sale",
    channel: "direct",
    transport: "air",
    regime: "standard",
    inventoryStatus: "free_circulation",
    sellerTaxRegistration: "registered",
    consignmentScopeConfirmed: true,
    taxEvidenceConfirmed: true,
    ...change,
  };
}
