export type SetupErrorCode =
  | 'DatasetNotFound'
  | 'DatasetParseError'
  | 'DatasetValidationError'
  | 'WorldAlreadyInitialized'
  | 'WorldNotEmpty'
  | 'InitializationFailed'
  | 'SetupUnavailable';

export class SetupError extends Error {
  readonly code: SetupErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: SetupErrorCode, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = code;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isSetupError(err: unknown): err is SetupError {
  return err instanceof SetupError;
}
