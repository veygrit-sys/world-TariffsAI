const chunkSize = 512 * 1024;
const parallelRanges = 4;
const strongEtag = /^"[\x21\x23-\x7e\x80-\xff]*"$/;

type RequestSource = (headers: Record<string, string>) => Promise<Response>;

export function sourceMediaType(response: Response) {
  return (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
}

export async function* readSourceBody(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const result = await reader.read().catch(() => { throw new Error("SOURCE_BODY_READ_FAILED"); });
      if (result.done) return;
      yield result.value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

type Representation = { etag: string; length: number; mediaType: string };

async function readRange(request: RequestSource, start: number, limit: number, accepted: readonly string[],
  representation?: Representation) {
  const last = Math.min(start + chunkSize, representation?.length ?? limit) - 1;
  const response = await request({
    range: `bytes=${start}-${last}`,
    "accept-encoding": "identity",
    ...(representation ? { "if-range": representation.etag } : {}),
  });
  const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get("content-range") ?? "");
  const etag = response.headers.get("etag") ?? "";
  const mediaType = sourceMediaType(response);
  const encoding = response.headers.get("content-encoding");
  const length = Number(contentRange?.[3]);
  const expectedEnd = Math.min(last, length - 1);
  const fail = async (code: string): Promise<never> => {
    await response.body?.cancel().catch(() => {});
    throw new Error(code);
  };
  if (response.status === 200 && representation) return fail("SOURCE_RANGE_REPRESENTATION_CHANGED");
  if (response.status !== 206) return fail("SOURCE_RANGE_HTTP_" + response.status);
  if (!strongEtag.test(etag)) return fail("SOURCE_RANGE_STRONG_ETAG_REQUIRED");
  if (!Number.isSafeInteger(length) || length > limit || length <= start ||
      Number(contentRange?.[1]) !== start || Number(contentRange?.[2]) !== expectedEnd)
    return fail("SOURCE_RANGE_INVALID_CONTENT_RANGE");
  if (representation && (representation.length !== length || representation.etag !== etag ||
      representation.mediaType !== mediaType))
    return fail("SOURCE_RANGE_REPRESENTATION_CHANGED");
  if (!accepted.includes(mediaType) || (encoding && encoding.toLowerCase() !== "identity") || !response.body)
    return fail("SOURCE_RANGE_UNEXPECTED_MEDIA");

  const bytes = Buffer.alloc(expectedEnd - start + 1);
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) !== bytes.length)
    return fail("SOURCE_RANGE_LENGTH_MISMATCH");
  let offset = 0;
  for await (const chunk of readSourceBody(response.body)) {
    if (offset + chunk.byteLength > bytes.length) throw new Error("SOURCE_RANGE_LENGTH_MISMATCH");
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== bytes.length) throw new Error("SOURCE_RANGE_LENGTH_MISMATCH");
  return { bytes, representation: { etag, length, mediaType } };
}

async function retryRange<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (!/^SOURCE_(?:TIMEOUT|TRANSPORT_FAILED|BODY_READ_FAILED|RANGE_HTTP_5\d\d)$/.test(reason)) throw error;
    return read();
  }
}

export async function recoverOfficialPdf(request: RequestSource, limit: number, accepted: readonly string[]) {
  const { bytes, representation } = await retryRange(() => readRange(request, 0, limit, accepted));
  async function* chunks() {
    yield bytes;
    for (let offset = bytes.length; offset < representation.length; offset += chunkSize * parallelRanges) {
      const starts = Array.from({ length: parallelRanges }, (_, index) => offset + index * chunkSize)
        .filter((start) => start < representation.length);
      const results = await Promise.allSettled(starts.map((start) =>
        retryRange(() => readRange(request, start, limit, accepted, representation))));
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
        yield result.value.bytes;
      }
    }
  }
  return { chunks: chunks(), expectedLength: representation.length, mediaType: representation.mediaType };
}
