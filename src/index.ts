import pg = require("pg");
export { default as Params } from "pg-params";

export interface IDbConfig {
  database: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ssl?: boolean;
}

let pools: [string, pg.Pool][] = [];
let configStringCache: [IDbConfig, string][] = [];

function configToString(config: IDbConfig) {
  return `${config.user}:${config.host}:${config.port}:${config.database}${
    typeof config.ssl !== "undefined" ? `:ssl-${config.ssl}` : ""
  }`;
}

function addToConfigStringCache(config: IDbConfig, strConfig: string) {
  configStringCache.push([config, strConfig]);
}

function findConfigString(config: IDbConfig) {
  const result = configStringCache.find(x => x[0] === config);
  if (result) {
    return result[1];
  }
}

function removeFromConfigStringCache(param: IDbConfig | string) {
  if (typeof param === "string") {
    configStringCache = configStringCache.filter(x => x[1] !== param);
  } else {
    configStringCache = configStringCache.filter(x => x[0] !== param);
  }
}

function removeFromPool(pool: pg.Pool) {
  pools = pools.filter(x => x[1] !== pool);
}

export function createPool(config: IDbConfig) {
  const configString = configToString(config);
  if (configStringCache.every(x => x[1] !== configString)) {
    const pool = new pg.Pool(config);
    addToConfigStringCache(config, configString);
    pools.push([configString, pool]);
  }
}

export function getPool(maybeConfig?: IDbConfig): pg.Pool {
  if (maybeConfig) {
    const config = maybeConfig;
    const strConfig = findConfigString(config) || configToString(config);
    const pool = pools.find(x => x[0] === strConfig);
    if (pool) {
      return pool[1];
    } else {
      throw new Error(
        `No matching pool found for ${config.user}@${config.host}:${
          config.port
        }/${config.database}`
      );
    }
  } else {
    if (pools.length === 1) {
      return pools[0][1];
    } else {
      throw new Error(`Pass the configuration corresponding to the db.`);
    }
  }
}

export async function endPool(config: IDbConfig) {
  if (config) {
    const strConfig = findConfigString(config) || configToString(config);
    const pool = pools.find(x => x[0] === strConfig);
    if (pool) {
      await pool[1].end();
      removeFromConfigStringCache(config);
      removeFromPool(pool[1]);
    } else {
      throw new Error(
        `No matching pool found for ${config.user}@${config.host}:${
          config.port
        }/${config.database}`
      );
    }
  } else {
    throw new Error(`Pass the configuration corresponding to the db.`);
  }
}

export async function endPools() {
  for (const pool of pools) {
    await pool[1].end();
    removeFromConfigStringCache(pool[0]);
    removeFromPool(pool[1]);
  }
}

export function internalNumPools() {
  return pools.length;
}

export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  maybeConfig?: IDbConfig
): Promise<T> {
  const pool = getPool(maybeConfig);
  const client = await pool.connect();
  const result = await fn(client);
  client.release();
  return result;
}

export type TransactionResult<T> =
  | { success: true; value: T }
  | { success: false; error: any };

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  maybeConfig?: IDbConfig
): Promise<TransactionResult<T>> {
  return await withClient(async (client: pg.PoolClient) => {
    await client.query("BEGIN");

    let value: T;
    try {
      value = await fn(client);
      await client.query("COMMIT");
      return { success: true as true, value };
    } catch (error) {
      await client.query("ROLLBACK");
      return { success: false as false, error };
    }
  }, maybeConfig);
}
