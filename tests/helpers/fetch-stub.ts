// A fetch stand-in that records requests and answers from a queue of responses.
export type Recorded = { url: string; method: string; headers: Record<string, string>; body: string };

export function stubFetch(responses: (Response | (() => Response))[]) {
  const calls: Recorded[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url: String(input), method: init.method ?? "GET", headers, body: init.body ? String(init.body) : "" });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch ${String(input)}`);
    return typeof next === "function" ? next() : next;
  };
  return { fetch: fn as typeof fetch, calls };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
