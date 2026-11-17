import assert from "node:assert/strict";
import test from "node:test";
import { inspectParcelAllocation } from "../src/parcel-allocation.ts";

test("every unit can be split across distinct parcels without changing inputs", () => {
  const items = Object.freeze([
    Object.freeze({ itemId: "a", quantity: 3 }),
    Object.freeze({ itemId: "b", quantity: 1 }),
  ]);
  const parcels = Object.freeze([
    Object.freeze({ parcelId: "first", items: Object.freeze([Object.freeze({ itemId: "a", quantity: 1 })]) }),
    Object.freeze({ parcelId: "second", items: Object.freeze([
      Object.freeze({ itemId: "a", quantity: 2 }), Object.freeze({ itemId: "b", quantity: 1 }),
    ]) }),
  ]);
  assert.deepEqual(inspectParcelAllocation(items, parcels), { diagnostics: [], quantitiesMatchEveryItem: true });
});

test("missing and excess units require different allocation corrections", () => {
  const result = inspectParcelAllocation([{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 1 }], [
    { parcelId: "first", items: [{ itemId: "a", quantity: 3 }] },
  ]);
  assert.equal(result.quantitiesMatchEveryItem, false);
  assert.deepEqual(result.diagnostics, [
    { kind: "quantity_mismatch", itemId: "a", expectedQuantity: 2, allocatedQuantity: 3 },
    { kind: "quantity_mismatch", itemId: "b", expectedQuantity: 1, allocatedQuantity: undefined },
  ]);
});

test("duplicate parcel identities and repeated local product rows remain invalid even when totals match", () => {
  const result = inspectParcelAllocation([{ itemId: "a", quantity: 3 }], [
    { parcelId: "same", items: [{ itemId: "a", quantity: 1 }, { itemId: "a", quantity: 1 }] },
    { parcelId: "same", items: [{ itemId: "a", quantity: 1 }] },
  ]);
  assert.equal(result.quantitiesMatchEveryItem, true);
  assert.deepEqual(result.diagnostics, [
    { kind: "parcel_item_mismatch", parcelId: "same", itemId: "a", unknownItem: false, duplicateItem: true },
    { kind: "duplicate_parcel", parcelId: "same" },
  ]);
});

test("unknown and repeated product rows produce one diagnostic per invalid row", () => {
  const result = inspectParcelAllocation([{ itemId: "a", quantity: 1 }], [
    { parcelId: "first", items: [
      { itemId: "outside-order", quantity: 1 },
      { itemId: "outside-order", quantity: 1 },
      { itemId: "a", quantity: 1 },
    ] },
  ]);
  assert.equal(result.quantitiesMatchEveryItem, true);
  assert.deepEqual(result.diagnostics, [
    { kind: "parcel_item_mismatch", parcelId: "first", itemId: "outside-order", unknownItem: true, duplicateItem: false },
    { kind: "parcel_item_mismatch", parcelId: "first", itemId: "outside-order", unknownItem: true, duplicateItem: true },
  ]);
});

test("duplicate parent rows retain ordered diagnostics and expose the every-row quantity check", () => {
  const result = inspectParcelAllocation([
    { itemId: "a", quantity: 1 }, { itemId: "b", quantity: 1 }, { itemId: "a", quantity: 2 },
  ], [{ parcelId: "first", items: [{ itemId: "a", quantity: 2 }] }]);
  assert.equal(result.quantitiesMatchEveryItem, false);
  assert.deepEqual(result.diagnostics, [
    { kind: "duplicate_item", itemId: "a" },
    { kind: "quantity_mismatch", itemId: "b", expectedQuantity: 1, allocatedQuantity: undefined },
  ]);
});

test("parent duplicates, parcel duplicates, row errors and final quantity errors retain traversal order", () => {
  const result = inspectParcelAllocation([
    { itemId: "a", quantity: 1 }, { itemId: "a", quantity: 2 }, { itemId: "b", quantity: 1 },
  ], [
    { parcelId: "same", items: [{ itemId: "outside-order", quantity: 1 }] },
    { parcelId: "same", items: [{ itemId: "a", quantity: 1 }, { itemId: "a", quantity: 2 }] },
  ]);
  assert.deepEqual(result.diagnostics.map(({ kind }) => kind), [
    "duplicate_item", "parcel_item_mismatch", "duplicate_parcel", "parcel_item_mismatch",
    "quantity_mismatch", "quantity_mismatch",
  ]);
  assert.equal(result.quantitiesMatchEveryItem, false);
});
