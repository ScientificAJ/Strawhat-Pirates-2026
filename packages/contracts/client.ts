import type { paths } from "./api-types";

type Method = "get" | "post" | "put" | "patch" | "delete";
type Operation<P extends keyof paths, M extends Method> = M extends keyof paths[P]
  ? NonNullable<paths[P][M]>
  : never;
type JsonBody<T> = T extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;
type JsonResponse<T> = T extends { responses: infer R }
  ? {
      [K in keyof R]: K extends 204 ? void : K extends 200 | 201 | 202
        ? R[K] extends { content: { "application/json": infer B } }
          ? B
          : never
        : never;
    }[keyof R]
  : never;
type AllowedMethod<P extends keyof paths> = {
  [M in Method]: [JsonResponse<Operation<P, M>>] extends [never] ? never : M;
}[Method];
type RequestOptions<T> = {
  path?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
} & ([JsonBody<T>] extends [never] ? { body?: never } : { body: JsonBody<T> });

export class ScientificApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(`Scientific API request failed (${status}).`);
  }
}

export function createScientificClient(baseUrl = "") {
  return async function request<P extends keyof paths, M extends AllowedMethod<P>>(
    path: P,
    method: M,
    ...arguments_: [JsonBody<Operation<P, M>>] extends [never]
      ? [options?: RequestOptions<Operation<P, M>>]
      : [options: RequestOptions<Operation<P, M>>]
  ): Promise<JsonResponse<Operation<P, M>>> {
    const options = (arguments_[0] ?? {}) as RequestOptions<Operation<P, M>>;
    const resolved = String(path).replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = options.path?.[key];
      if (value === undefined) throw new Error(`Missing API path parameter: ${key}`);
      return encodeURIComponent(String(value));
    });
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) query.set(key, String(value));
    }
    const suffix = query.size ? `?${query}` : "";
    const response = await fetch(`${baseUrl}${resolved}${suffix}`, {
      method: method.toUpperCase(),
      credentials: "same-origin",
      signal: options.signal,
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) return undefined as JsonResponse<Operation<P, M>>;
    const data: unknown = await response.json();
    if (!response.ok) throw new ScientificApiError(response.status, data);
    return data as JsonResponse<Operation<P, M>>;
  };
}
