interface ApiEnvelope<T> {
  data: T;
}

export type HttpError = Error & {
  statusCode: number;
  code: string;
  details?: unknown;
};

export function ok<T>(data: T): ApiEnvelope<T> {
  return { data };
}

export function httpError(statusCode: number, code: string, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

export function badRequest(message: string, details?: unknown): HttpError {
  return httpError(400, "bad_request", message, details);
}

export function notFound(message = "Resource not found", details?: unknown): HttpError {
  return httpError(404, "not_found", message, details);
}

export function conflict(message: string, details?: unknown): HttpError {
  return httpError(409, "conflict", message, details);
}

export function moduleStatus(moduleName: string) {
  return ok({
    module: moduleName,
    status: "scaffolded"
  });
}
