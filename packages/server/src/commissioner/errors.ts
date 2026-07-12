export class CommissionerHttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = code;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function commissionerErrorBody(err: CommissionerHttpError) {
  return {
    error: err.code,
    message: err.message,
    ...(err.details !== undefined ? { details: err.details } : {}),
  };
}
