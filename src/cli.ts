import { readFileSync } from "node:fs";
import {
  assess,
  previewCheckout,
  planCustoms,
  quotePilotShipment,
  quoteWorldShipment,
  worldDirection,
  worldDirectionCoverage,
  reconcileInvoice,
  reconcileImportSettlementLedger,
  releaseReadiness,
  loadLiveValidationRecords,
  coverageLedger,
  todayJst,
  ask,
  classify,
  proposeClassification,
  classificationRollout,
  assignClassification,
  assignClassificationBatch,
  loadClassificationCatalog,
  loadClassificationEvents,
  loadDataset,
  loadOperationalTariffCatalog,
} from "./index.ts";
import { InputError } from "./schema.ts";
const [command, arg, referenceTime] = process.argv.slice(2);
try {
  const data = loadDataset();
  let result: unknown;
  if (command === "assess" && arg)
    result = assess(JSON.parse(readFileSync(arg, "utf8")), data);
  else if (command === "checkout-preview" && arg)
    result = previewCheckout(
      JSON.parse(readFileSync(arg, "utf8")), data, new Date(), loadOperationalTariffCatalog(data),
    );
  else if (command === "customs-plan" && arg)
    result = planCustoms(
      JSON.parse(readFileSync(arg, "utf8")), data, loadOperationalTariffCatalog(data),
    );
  else if ((command === "pilot-quote" || command === "worldwide-quote") && arg) {
    const now = referenceTime ? new Date(referenceTime) : new Date();
    if (!Number.isFinite(now.getTime()))
      throw new InputError([{ path: "/referenceTime", code: "INVALID_DATE_TIME" }]);
    const quote = command === "pilot-quote" ? quotePilotShipment : quoteWorldShipment;
    result = quote(
      JSON.parse(readFileSync(arg, "utf8")), data, loadOperationalTariffCatalog(data), now,
    );
  } else if (command === "import-settlement-ledger" && arg) {
    const now = referenceTime ? new Date(referenceTime) : new Date();
    if (!Number.isFinite(now.getTime()))
      throw new InputError([{ path: "/referenceTime", code: "INVALID_DATE_TIME" }]);
    result = reconcileImportSettlementLedger(JSON.parse(readFileSync(arg, "utf8")), now, data);
  } else if (["classification-propose", "classification-assign", "classification-batch"].includes(command ?? "") && arg) {
    const now = referenceTime ? new Date(referenceTime) : new Date();
    if (!Number.isFinite(now.getTime()))
      throw new InputError([{ path: "/referenceTime", code: "INVALID_DATE_TIME" }]);
    const input = JSON.parse(readFileSync(arg, "utf8"));
    const catalog = loadClassificationCatalog(process.env, data);
    result = command === "classification-propose" ? proposeClassification(input, catalog, data, now)
      : command === "classification-batch" ? assignClassificationBatch(input, catalog, loadClassificationEvents(process.env, now), data, now)
      : assignClassification(input, catalog, loadClassificationEvents(process.env, now), data, now);
  } else if (command === "classification-rollout") {
    const now = referenceTime !== undefined ? new Date(referenceTime) : new Date();
    if (!Number.isFinite(now.getTime())) throw new InputError([{ path: "/referenceTime", code: "INVALID_DATE_TIME" }]);
    result = classificationRollout({ ...(arg !== undefined ? { date: arg } : {}), hsEdition: "all", limit: 250 }, loadClassificationCatalog(process.env, data), data, now);
  } else if (command === "invoice-reconcile" && arg)
    result = reconcileInvoice(JSON.parse(readFileSync(arg, "utf8")));
  else if (command === "release-readiness")
    result = releaseReadiness(data, new Date(), loadLiveValidationRecords(),
      loadOperationalTariffCatalog(data).manifestSha256());
  else if (command === "worldwide-direction" && arg)
    result = worldDirection(
      JSON.parse(readFileSync(arg, "utf8")), data, loadOperationalTariffCatalog(data),
    );
  else if (command === "worldwide-coverage")
    result = worldDirectionCoverage(data, loadOperationalTariffCatalog(data), arg);
  else if (command === "ask" && arg)
    result = await ask({ question: arg }, data);
  else if (command === "classify" && arg)
    result = classify({ description: arg });
  else if (command === "countries") result = data.countries;
  else if (command === "tariff" && arg)
    result = loadOperationalTariffCatalog(data).lookup(
      JSON.parse(readFileSync(arg, "utf8")),
    );
  else if (command === "tariff-coverage")
    result = loadOperationalTariffCatalog(data).coverage();
  else if (command === "tariff-wco-coverage")
    result = loadOperationalTariffCatalog(data).wcoCoverage(arg);
  else if (command === "tariff-territory-coverage")
    result = loadOperationalTariffCatalog(data).territoryCoverage(arg);
  else if (command === "destination-coverage") {
    const now = new Date();
    result = coverageLedger(
      data, loadOperationalTariffCatalog(data),
      arg ?? todayJst(now), now,
    );
  } else {
    process.stderr.write(
      'Usage: npm run cli -- assess FILE | ask "question" | classify "description" | countries | tariff FILE | tariff-coverage | tariff-wco-coverage [DATE] | tariff-territory-coverage [DATE] | destination-coverage [DATE] | checkout-preview FILE | customs-plan FILE | pilot-quote FILE [ISO_TIME] | worldwide-coverage [DATE] | worldwide-direction FILE | worldwide-quote FILE [ISO_TIME] | invoice-reconcile FILE | import-settlement-ledger FILE [ISO_TIME] | classification-rollout [DATE] [ISO_TIME] | classification-propose FILE [ISO_TIME] | classification-assign FILE [ISO_TIME] | classification-batch FILE [ISO_TIME] | release-readiness\n',
    );
    process.exitCode = 2;
  }
  if (result !== undefined)
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      error instanceof InputError
        ? { error: error.message, issues: error.issues }
        : { error: "COMMAND_FAILED" },
    ) + "\n",
  );
  process.exitCode = 1;
}
