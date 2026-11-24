# Great Britain low-value direct sales

A VAT-registered seller ships one confirmed B2C consignment from stock held outside the UK at the point of sale to a customer in England, Scotland or Wales. The preview uses GBP, a direct sale and non-excise goods. The dispatch country and the manufacturing origin of each item may differ. Northern Ireland, marketplace sales, gifts, returns, goods already in the UK and consignments dispatched from Jersey or Guernsey require separate review.

The pilot reuses the existing `GB_LOW_VALUE` rule for the £135 inclusive threshold and standard-rate VAT. Enter the net price per unit, the complete quantities, and any separately invoiced freight in `shipment`. The explicit invoice evidence confirms that the amounts exclude VAT and that freight has been itemised separately. An invoice with bundled charges or an uncertain basis goes to review. Declared insurance above zero, or delivery outside the goods contract, requires review of the checkout amount.

| Evidence | Meaning |
| --- | --- |
| `saleDate`, `stockAtSale` | Date of the actual or proposed sale and physical location of the goods at that time. |
| `destinationRegion`, `nonExciseConfirmed` | Reviewed delivery region and confirmation that the whole parcel contains only non-excise goods. |
| `invoiceBasis`, `deliveryContract` | Goods are net of VAT, freight is separately shown, and delivery to the customer is required by the sale contract. |
| `skuReviews` | One entry per shipment item. The merchant SKU and item ID must match. Each classification must be confirmed. |

A reviewer selects `standard` only for goods individually confirmed to bear the standard rate. For `bound_printed_literary_work`, the reviewer confirms the physical article is a bound printed literary work sold on its own. This pilot additionally requires confirmed HS 490199 and excludes conflicting standard-rate declarations. It holds VAT on mixed-rate orders and on unreviewed items. HMRC's delivery guidance applies the VAT rate of a single supply of goods to any separate charge for contractually required delivery.

The [synthetic ballpoint pen order](../examples/country-pilot/gb.json) has two units at £60 and £8 separately invoiced freight. Its intrinsic value is £120. The VAT base is £128 and checkout VAT is £25.60. Ordinary customs duty is £0. Additional import VAT is £0 when the checkout tax handoff is confirmed. The [synthetic merchant receipt](../tests/fixtures/gb-pilot-pos-receipt.json) records the £153.60 purchase and binds the sale date and full request digest for replay. Carrier invoices, handling, brokerage and trade remedies remain outside this calculation. Before expanding beyond shadow use, compare each category against an actual order, its merchant receipt and any carrier or customs documents.

## Public authority references

The following HMRC pages were reviewed for this pilot on 24 November 2026 UTC. Its assessment, sale and import dates must fall within the pilot's 24 November to 11 December 2026 review window. A shorter underlying source deadline also applies.

- Direct-sale scope, point-of-sale VAT, intrinsic valuation and excluded consignments. [HMRC direct overseas sales](https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk)
- Great Britain customs duty and the collection of VAT on goods sent from abroad. [HMRC tax and duty](https://www.gov.uk/goods-sent-from-abroad/tax-and-duty)
- Standard VAT rate. [HMRC VAT and duties](https://www.gov.uk/tax-on-shopping/vat-duties)
- VAT treatment of required and separate delivery under the contract. [VAT Notice 700/24, section 2.2](https://www.gov.uk/guidance/vat-on-postage-delivery-and-direct-marketing-notice-70024)
- Physical characteristics and function of qualifying books and excluded stationery. [VAT Notice 701/10, section 3.1](https://www.gov.uk/guidance/zero-rating-books-and-printed-matter-for-vat-notice-70110)
- HMRC describes a future change to low-value duty relief that will commence on a date appointed by the Treasury in regulations made by October 2028 at the latest. [HMRC reform timeline](https://www.gov.uk/government/publications/reforming-customs-rules-for-low-value-imports/reforming-the-customs-treatment-of-low-value-imports-into-the-uk)

## Component document comparison

The [synthetic checkout comparison](../examples/country-pilot/gb-receipt.json) bundles the preview request with an independently entered receipt line. `reconcileCountryPreview` recomputes the preview using the current reviewed sources and compares observations at the same collection stage and charge category. An import document can explicitly report zero duty or VAT. Omitted lines stay unknown. The difference is the document amount minus the preview amount, in the original currency.

Submit an optional request digest and issue date to detect order mismatches, future documents and import invoices predating import. The GB checkout date also checks the receipt against the sale date. Matching components establish numerical agreement for the submitted values. Document authenticity and parcel identity still require the underlying records. The example and receipt are synthetic.

For an EU import document with an F00 handling fee, the comparison retains the buyer-liability notice from the country preview. A document match leaves the identity of the ultimate payer and any pass-through to the buyer unverified.
