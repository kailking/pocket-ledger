import type { ApiEnvelope, ApiError } from "@pocket-ledger/shared";

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed: ${response.status}`;
  const text = await response.text();
  if (!text) return fallback;

  try {
    const payload = JSON.parse(text) as Partial<ApiError> & {
      message?: string;
      error?: { message?: string; details?: unknown };
    };
    const detailMessages = Array.isArray(payload.error?.details)
      ? payload.error.details
          .map((detail) => {
            if (typeof detail !== "object" || detail === null) return "";
            const path = Array.isArray((detail as { path?: unknown }).path)
              ? (detail as { path: unknown[] }).path.join(".")
              : "";
            const message = typeof (detail as { message?: unknown }).message === "string" ? (detail as { message: string }).message : "";
            return [path, message].filter(Boolean).join(": ");
          })
          .filter(Boolean)
      : [];
    return detailMessages[0] ?? payload.error?.message ?? payload.message ?? text;
  } catch {
    return text;
  }
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  return body.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readEnvelope<T>(response);
}

export async function apiPost<T, TBody = unknown>(path: string, body: TBody): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readEnvelope<T>(response);
}

export async function apiPut<T, TBody = unknown>(path: string, body: TBody): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readEnvelope<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readEnvelope<T>(response);
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    body
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readEnvelope<T>(response);
}
