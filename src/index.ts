import pg = require("pg");

export interface IDbConfig {
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
}

const pools: [IDbConfig, pg.Pool][] = [];
let defaultConfig: IDbConfig;

export function createPool(dbConfig: IDbConfig) {
  const pool = new pg.Pool(dbConfig);
  pools.push([dbConfig, pool]);
}

export function setDefaultConfig(dbConfig: IDbConfig) {
  defaultConfig = dbConfig;
}

export function getPool(dbConfig: IDbConfig = defaultConfig): pg.Pool {
  if (dbConfig) {
    const pool = pools.find(x => x[0] === dbConfig);
    if (pool) {
      return pool[1];
    } else {
      throw new Error(
        `No matching pool found for ${dbConfig.user}@${dbConfig.host}:${
          dbConfig.port
        }/${dbConfig.database}`
      );
    }
  } else {
    throw new Error(`A default connection pool was not specified.`);
  }
}

export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T | undefined>,
  dbConfig: IDbConfig = defaultConfig
): Promise<T | undefined> {
  const pool = getPool(dbConfig);
  const client = await pool.connect();
  const result = await fn(client);
  client.release();
  return result;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T | undefined>,
  dbConfig: IDbConfig = defaultConfig
): Promise<T | undefined> {
  return await withClient(async (client: pg.PoolClient) => {
    await client.query("BEGIN");

    let result: T | undefined;
    try {
      result = await fn(client);
    } catch {
      await client.query("ROLLBACK");
    }

    return result;
  }, dbConfig);
}

export async function shutdownPools() {
  await Promise.all(pools.map(p => p[1].end()));
}
