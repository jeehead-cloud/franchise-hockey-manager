/** F29 trade HTTP error boundary. Carries a stable error code + status. */
export class TradeHttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = code;
  }
}
