import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { requireCoverageDate } from "./wco.ts";

export interface TariffReviewScope {
  referenceDate: string;
  requiredDestinations: string[];
  /** Bundled manifest followed by additional manifests in activation order. */
  manifestSha256: string[];
}

export interface TariffReviewDraft extends TariffReviewScope {
  keyId: string;
  reviewer: string;
  reviewedOn: string;
  referenceUrl: string;
}

export interface SignedTariffReview extends TariffReviewDraft {
  signature: string;
}

const draftFields = [
  "keyId", "reviewer", "reviewedOn", "referenceUrl",
  "referenceDate", "requiredDestinations", "manifestSha256",
] as const;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_TARIFF_REVIEW");
  return value as Record<string, unknown>;
}

function readDraft(value: unknown): TariffReviewDraft {
  const fields = object(value);
  if (Object.keys(fields).length !== draftFields.length || draftFields.some((field) => !Object.hasOwn(fields, field)))
    throw new Error("INVALID_TARIFF_REVIEW");
  const { keyId, reviewer, reviewedOn, referenceUrl, referenceDate, requiredDestinations, manifestSha256 } = fields;
  if (typeof keyId !== "string" || !keyIdPattern.test(keyId) ||
      typeof reviewer !== "string" || !reviewer.trim() || reviewer.length > 120 ||
      typeof reviewedOn !== "string" || typeof referenceDate !== "string" ||
      typeof referenceUrl !== "string" || !Array.isArray(requiredDestinations) || !requiredDestinations.length ||
      requiredDestinations.some((code) => typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) ||
      new Set(requiredDestinations).size !== requiredDestinations.length ||
      !Array.isArray(manifestSha256) || !manifestSha256.length ||
      manifestSha256.some((digest) => typeof digest !== "string" || !sha256Pattern.test(digest)))
    throw new Error("INVALID_TARIFF_REVIEW");
  requireCoverageDate(reviewedOn);
  requireCoverageDate(referenceDate);
  const url = URL.parse(referenceUrl);
  if (!url || url.protocol !== "https:" || url.username || url.password)
    throw new Error("INVALID_TARIFF_REVIEW_URL");
  return {
    keyId, reviewer, reviewedOn, referenceUrl, referenceDate,
    requiredDestinations: [...requiredDestinations].sort(), manifestSha256: [...manifestSha256],
  };
}

function signingPayload(draft: TariffReviewDraft): Buffer {
  return Buffer.from(JSON.stringify({ purpose: "veygrit.tariff.review.v1", ...draft }), "utf8");
}

export function signTariffReview(input: unknown, privateKey: string | Buffer): SignedTariffReview {
  const draft = readDraft(input);
  let key: KeyObject;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    throw new Error("INVALID_TARIFF_REVIEW_PRIVATE_KEY");
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("INVALID_TARIFF_REVIEW_PRIVATE_KEY");
  return { ...draft, signature: sign(null, signingPayload(draft), key).toString("base64url") };
}

export function authenticateTariffReview(
  input: unknown,
  trustedKeys: unknown,
  today: string,
): SignedTariffReview {
  const { signature, ...unsigned } = object(input);
  if (typeof signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(signature))
    throw new Error("UPDATE_REVIEW_SIGNATURE_REQUIRED");
  const bytes = Buffer.from(signature, "base64url");
  if (bytes.length !== 64 || bytes.toString("base64url") !== signature)
    throw new Error("INVALID_TARIFF_REVIEW_SIGNATURE");
  const draft = readDraft(unsigned);
  const keys = object(trustedKeys);
  if (!Object.hasOwn(keys, draft.keyId)) throw new Error("UPDATE_REVIEW_KEY_NOT_TRUSTED");
  const pem = keys[draft.keyId];
  let key: KeyObject;
  try {
    if (typeof pem !== "string" || !pem.trim().startsWith("-----BEGIN PUBLIC KEY-----"))
      throw new Error("INVALID_TARIFF_REVIEW_PUBLIC_KEY");
    key = createPublicKey(pem);
  } catch {
    throw new Error("INVALID_TARIFF_REVIEW_PUBLIC_KEY");
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new Error("INVALID_TARIFF_REVIEW_PUBLIC_KEY");
  if (!verify(null, signingPayload(draft), key, bytes))
    throw new Error("INVALID_TARIFF_REVIEW_SIGNATURE");
  if (draft.reviewedOn > today)
    throw new Error("UPDATE_REVIEW_IN_FUTURE");
  return { ...draft, signature };
}

export function verifySignedTariffReview(
  input: unknown,
  trustedKeys: unknown,
  scope: TariffReviewScope,
  today: string,
): SignedTariffReview {
  const review = authenticateTariffReview(input, trustedKeys, today);
  if (!isDeepStrictEqual(review.manifestSha256, scope.manifestSha256))
    throw new Error("UPDATE_REVIEW_MANIFEST_MISMATCH");
  if (review.referenceDate !== scope.referenceDate ||
      !isDeepStrictEqual(review.requiredDestinations, [...scope.requiredDestinations].sort()))
    throw new Error("UPDATE_REVIEW_SCOPE_MISMATCH");
  return review;
}
