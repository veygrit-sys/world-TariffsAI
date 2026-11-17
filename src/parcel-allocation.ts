export interface ParcelAllocationItem {
  itemId: string;
  quantity: number;
}

export interface AllocatedParcel {
  parcelId: string;
  items: readonly ParcelAllocationItem[];
}

export type ParcelAllocationDiagnostic =
  | { kind: "duplicate_item"; itemId: string }
  | { kind: "duplicate_parcel"; parcelId: string }
  | {
      kind: "parcel_item_mismatch";
      parcelId: string;
      itemId: string;
      unknownItem: boolean;
      duplicateItem: boolean;
    }
  | {
      kind: "quantity_mismatch";
      itemId: string;
      expectedQuantity: number;
      allocatedQuantity: number | undefined;
    };

export interface ParcelAllocationInspection {
  diagnostics: ParcelAllocationDiagnostic[];
  /** Checks every input row, including rows with a repeated parent item ID. */
  quantitiesMatchEveryItem: boolean;
}

/** Inspect schema-validated quantities without changing the supplied order or parcels.
 * Diagnostics follow input traversal order. For a repeated parent item ID, the
 * final quantity diagnostic uses the last quantity and the first insertion position.
 * Callers retain their own public error codes and policy for duplicate parent rows.
 */
export function inspectParcelAllocation(
  items: readonly ParcelAllocationItem[],
  parcels: readonly AllocatedParcel[],
): ParcelAllocationInspection {
  const diagnostics: ParcelAllocationDiagnostic[] = [];
  const expected = new Map<string, number>();
  for (const item of items) {
    if (expected.has(item.itemId)) diagnostics.push({ kind: "duplicate_item", itemId: item.itemId });
    expected.set(item.itemId, item.quantity);
  }

  const allocated = new Map<string, number>();
  const parcelIds = new Set<string>();
  for (const parcel of parcels) {
    if (parcelIds.has(parcel.parcelId)) diagnostics.push({ kind: "duplicate_parcel", parcelId: parcel.parcelId });
    parcelIds.add(parcel.parcelId);
    const localItems = new Set<string>();
    for (const item of parcel.items) {
      const unknownItem = !expected.has(item.itemId);
      const duplicateItem = localItems.has(item.itemId);
      if (unknownItem || duplicateItem) {
        diagnostics.push({
          kind: "parcel_item_mismatch", parcelId: parcel.parcelId, itemId: item.itemId,
          unknownItem, duplicateItem,
        });
      }
      localItems.add(item.itemId);
      allocated.set(item.itemId, (allocated.get(item.itemId) ?? 0) + item.quantity);
    }
  }

  for (const [itemId, quantity] of expected) {
    if (allocated.get(itemId) !== quantity) {
      diagnostics.push({
        kind: "quantity_mismatch", itemId, expectedQuantity: quantity,
        allocatedQuantity: allocated.get(itemId),
      });
    }
  }
  return {
    diagnostics,
    quantitiesMatchEveryItem: items.every(({ itemId, quantity }) => allocated.get(itemId) === quantity),
  };
}
