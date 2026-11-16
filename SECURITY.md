# Security

This package processes structured customs decision-support requests. It does not store addresses, file declarations, perform payments or authorise shipments.

## Implemented boundaries

- Strict JSON Schema validation without type coercion or silently removed fields.
- Server-to-server bearer authentication with constant-size digest comparison.
- Loopback binding by default; unauthenticated mode requires a loopback peer and binding.
- No browser CORS, no-store responses, body-size limits, bounded model responses, request timeouts and a bounded process-local rate limiter.
- No request, prompt, response body, credential or raw provider-error logging.
- No user-controlled outbound URLs. Local Ollama is optional; remote origins require an operator-supplied HTTPS allowlist in code. Redirects are rejected.
- Raw questions, product descriptions, merchant/order references, address references, identity data and payment data are excluded from model requests. Only a fixed intent and reviewed evidence are sent.
- Model-selected IDs are validated against retrieved primary evidence. Generated amounts, URLs and prose are not used.
- Dataset hashes are verified on startup. Inherited research cannot activate numeric rules. Hashes detect accidental drift; they are not signatures.
- Veygrit integration checks merchant/order ownership, cart version, grant scope, revocation, expiry, address version and destination consistency through trusted service ports.
- Customs review packets use the authenticated service boundary. They include item IDs and customs facts from the order and omit raw product descriptions and grant references. An identified special customs territory comes from the address service in the verified-order integration.

## Deployment responsibilities

Use TLS and authenticated application sessions at the merchant boundary. Keep the service key in server secrets and rotate it through the operating platform. Never expose this service key to the checkout browser. Shared bearer authentication is not tenant isolation; the merchant gateway and Veygrit ports enforce tenant ownership.

For multiple replicas, use shared rate limits at the gateway, resource limits, monitoring and deployment-specific request controls. The sample rate limiter is per process and does not trust forwarded IP headers. Next.js example callers share the internal-service bucket.

Keep country/zone and product-review flags server-derived. A request's booleans are assumptions backed by the integrating system; this package cannot prove a customer's identity, classification, tax registration, origin, customs value or evidence authenticity.

Perform current export-control, sanctions, party, product-safety and carrier checks outside this initial module. Recognition of a country never implies that trade or transport is available. Recheck address permission, expiry and tax/routing facts immediately before release.

Preserve the global/China operational boundary of the address service. This package has no cross-border replication or external telemetry. If a model server collects prompts, its configuration and access controls remain the operator's responsibility; the outbound payload contains only curated evidence.

## Validation limits

Automated tests use synthetic data and mocked model/identity services. They do not establish customs authority approval, complete worldwide tax coverage, live sanctions screening, real-EC compatibility, a legal tariff classification or actual shipping acceptance. Container build, live Ollama inference, production Next.js packaging and external identity-service integration need environment-specific validation.

Report security issues through the repository owner's private security channel when configured. Do not post addresses, identity documents, keys or production payloads in a public issue.
