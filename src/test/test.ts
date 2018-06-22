import "mocha";
import pg = require("pg");
import "should";
import * as pgpack from "../";

const shouldLib = require("should");

if (
  [
    process.env.PG_PACK_TESTDB,
    process.env.PG_PACK_HOST,
    process.env.PG_PACK_PASSWORD,
    process.env.PG_PACK_PORT,
    process.env.PG_PACK_USER
  ].some(x => typeof x === "undefined")
) {
  // tslint:disable:max-line-length
  throw new Error(
    `Test env variables are not set. You need to set PG_PACK_TESTDB, PG_PACK_HOST, PG_PACK_PASSWORD, PG_PACK_PORT and PG_PACK_USER`
  );
  // tslint:enable:max-line-length
}

const config = {
  database: process.env.PG_PACK_TESTDB as string,
  host: process.env.PG_PACK_HOST as string,
  password: process.env.PG_PACK_PASSWORD as string,
  port: process.env.PG_PACK_PORT
    ? parseInt(process.env.PG_PACK_PORT, 10)
    : 5432,
  user: process.env.PG_PACK_USER as string
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("pg-pack", () => {
  // Create a database
  before(async function resetDb() {
    const pool = new pg.Pool({ ...config, database: "template1" });

    const {
      rows: existingDbRows
    } = await pool.query(`SELECT 1 AS result FROM pg_database
    WHERE datname='${config.database}'`);

    if (existingDbRows.length) {
      await pool.query(`DROP DATABASE ${config.database}`);
    }

    await pool.query(`CREATE DATABASE ${config.database}`);
  });

  beforeEach(async function resetTables() {
    const pool = new pg.Pool(config);
    await pool.query(`DROP TABLE IF EXISTS account`);

    await pool.query(`
      CREATE TABLE account(
        user_id serial PRIMARY KEY,
        username VARCHAR (50) UNIQUE NOT NULL,
        password VARCHAR (50) NOT NULL,
        email VARCHAR (355) UNIQUE NOT NULL
      );`);
  });

  afterEach(async function resetPools() {
    await pgpack.endPools();
  });

  it("returns Params", async () => {
    const params = new pgpack.Params({ username: "jeswin" });
    shouldLib.exist(params);
  });

  it("creates a pool", async () => {
    pgpack.createPool({ ...config, user: "alice" });
    pgpack.createPool({ ...config, user: "bob" });
    const numPools = pgpack.internalNumPools();
    numPools.should.equal(2);
  });

  it("reuses a pool for existing config", async () => {
    pgpack.createPool({ ...config, user: "alice" });
    pgpack.createPool({ ...config, user: "alice" });
    const numPools = pgpack.internalNumPools();
    numPools.should.equal(1);
  });

  it("gets a pool and runs a query", async () => {
    pgpack.createPool(config);
    const pool = pgpack.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );
  });

  it("ends a pool", async () => {
    pgpack.createPool(config);
    const pool = pgpack.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );
    await pgpack.endPool(config);
    pgpack.internalNumPools().should.equal(0);
  });

  it("returns a client", async () => {
    pgpack.createPool(config);

    const pool = pgpack.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    const result = (await pgpack.withClient(
      async client => await client.query(`SELECT * FROM account`),
      config
    )) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(1);
    result.rows[0].username.should.equal("jeswin");
  });

  it("commits a successful transaction", async () => {
    pgpack.createPool(config);

    const pool = pgpack.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    await pgpack.withTransaction(async client => {
      client.query(`INSERT INTO account (
        username, password, email) VALUES ('jeswin1', 'secretive', 'jeswin1@example.com')`);
    }, config);

    const result = (await pgpack.withClient(async client => {
      return await client.query(`SELECT * FROM account`);
    }, config)) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(2);
    result.rows[0].username.should.equal("jeswin");
    result.rows[1].username.should.equal("jeswin1");
  });

  it("rolls back an erroring transaction", async () => {
    pgpack.createPool(config);

    const pool = pgpack.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    await pgpack.withTransaction(async client => {
      client.query(`INSERT INTO account (
        username, password, email) VALUES ('jeswin1', 'secretive', 'jeswin1@example.com')`);
      throw new Error();
    }, config);

    const result = (await pgpack.withClient(async client => {
      return await client.query(`SELECT * FROM account`);
    }, config)) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(1);
    result.rows[0].username.should.equal("jeswin");
  });
});
