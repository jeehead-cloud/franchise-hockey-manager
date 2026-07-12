export interface ServerConfig {
  port: number;
  host: string;
  databaseUrl: string;
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  return {
    port,
    host: process.env.HOST ?? '127.0.0.1',
    databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  };
}
