export async function fetchPublicPage(url, { signal, maxBytes = 2 * 1024 * 1024 } = {}) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    redirect: "manual",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    headers: { Accept: "text/html, text/plain;q=0.9" },
    signal,
  });
  const headers = Object.fromEntries(response.headers.entries());
  const result = { status: response.status, type: response.type, headers, body: "" };
  if (!response.ok || response.type === "opaqueredirect") {
    await response.body?.cancel();
    return result;
  }
  if (Number(headers["content-length"]) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Page exceeds the download size limit");
  }
  const reader = response.body?.getReader();
  if (!reader) return result;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Page exceeds the download size limit");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  result.body = new TextDecoder().decode(body);
  return result;
}
