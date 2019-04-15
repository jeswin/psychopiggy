import "mocha";
import pg = require("pg");
import "should";
import * as psychopiggy from "../";

const shouldLib = require("should");

if (
  [
    process.env.PSYCHOPIGGY_TESTDB,
    process.env.PSYCHOPIGGY_HOST,
    process.env.PSYCHOPIGGY_PASSWORD,
    process.env.PSYCHOPIGGY_PORT,
    process.env.PSYCHOPIGGY_USER
  ].some(x => typeof x === "undefined")
) {
  // tslint:disable:max-line-length
  throw new Error(
    `Test env variables are not set. You need to set PSYCHOPIGGY_TESTDB, PSYCHOPIGGY_HOST, PSYCHOPIGGY_PASSWORD, PSYCHOPIGGY_PORT and PSYCHOPIGGY_USER`
  );
  // tslint:enable:max-line-length
}

const config = {
  database: process.env.PSYCHOPIGGY_TESTDB as string,
  host: process.env.PSYCHOPIGGY_HOST as string,
  password: process.env.PSYCHOPIGGY_PASSWORD as string,
  port: process.env.PSYCHOPIGGY_PORT
    ? parseInt(process.env.PSYCHOPIGGY_PORT, 10)
    : 5432,
  user: process.env.PSYCHOPIGGY_USER as string
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("psychopiggy", () => {
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
    await psychopiggy.endPools();
  });

  it("returns Params", async () => {
    const params = new psychopiggy.Params({ username: "jeswin" });
    shouldLib.exist(params);
  });

  it("creates a pool", async () => {
    psychopiggy.createPool({ ...config, user: "alice" });
    psychopiggy.createPool({ ...config, user: "bob" });
    const numPools = psychopiggy.internalNumPools();
    numPools.should.equal(2);
  });

  it("reuses a pool for existing config", async () => {
    psychopiggy.createPool({ ...config, user: "alice" });
    psychopiggy.createPool({ ...config, user: "alice" });
    const numPools = psychopiggy.internalNumPools();
    numPools.should.equal(1);
  });

  it("gets a pool and runs a query", async () => {
    psychopiggy.createPool(config);
    const pool = psychopiggy.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );
  });

  it("ends a pool", async () => {
    psychopiggy.createPool(config);
    const pool = psychopiggy.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );
    await psychopiggy.endPool(config);
    psychopiggy.internalNumPools().should.equal(0);
  });

  it("can use prepared statements", async () => {
    psychopiggy.createPool(config);
    const pool = psychopiggy.getPool(config);
    const params = new psychopiggy.Params({
      email: "jeswin@example.com",
      password: "helloworld",
      username: "jeswin"
    });
    const { rows } = await pool.query(
      `INSERT INTO account (${params.columns()}) VALUES (${params.ids()})`,
      params.values()
    );
  });

  it("returns a client", async () => {
    psychopiggy.createPool(config);

    const pool = psychopiggy.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    const result = (await psychopiggy.withClient(
      async client => await client.query(`SELECT * FROM account`),
      config
    )) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(1);
    result.rows[0].username.should.equal("jeswin");
  });

  it("commits a successful transaction", async () => {
    psychopiggy.createPool(config);

    const pool = psychopiggy.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    await psychopiggy.withTransaction(async client => {
      await client.query(`INSERT INTO account (
        username, password, email) VALUES ('jeswin1', 'secretive1', 'jeswin1@example.com')`);
      await client.query(`INSERT INTO account (
          username, password, email) VALUES ('jeswin2', 'secretive2', 'jeswin2@example.com')`);
    }, config);

    const result = (await psychopiggy.withClient(async client => {
      return await client.query(`SELECT * FROM account`);
    }, config)) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(3);
    result.rows[0].username.should.equal("jeswin");
    result.rows[1].username.should.equal("jeswin1");
    result.rows[2].username.should.equal("jeswin2");
  });

  it("rolls back an erroring transaction", async () => {
    psychopiggy.createPool(config);

    const pool = psychopiggy.getPool(config);
    const { rows } = await pool.query(
      `INSERT INTO account (
      username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
    );

    await psychopiggy.withTransaction(async client => {
      client.query(`INSERT INTO account (
        username, password, email) VALUES ('jeswin1', 'secretive', 'jeswin1@example.com')`);
      throw new Error();
    }, config);

    const result = (await psychopiggy.withClient(async client => {
      return await client.query(`SELECT * FROM account`);
    }, config)) as any;

    shouldLib.exist(result);

    result.rows.length.should.equal(1);
    result.rows[0].username.should.equal("jeswin");
  });
});
