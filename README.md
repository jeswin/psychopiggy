# psychopiggy

Psychopiggy is a thin wrapper around the excellent 'pg' module.

Adds these features:

- Named parameters
- Releases clients automatically
- Avoids transaction boilerplate

## Installation

```bash
npm install psychopiggy
```

## Usage

Here's how to run a simple query

```js
import * as pg from "psychopiggy";

// connection config
const config = {
  database: "dbname",
  host: "hostname",
  user: "dbusername",
  password: "password",
  port: 5432
};

// Using pools.
async function createAccount() {
  pg.createPool(config);
  const pool = pg.getPool(config);
  const { rows } = await pool.query(
    `INSERT INTO account (
    username, password, email) VALUES ('jeswin', 'secretive', 'jeswin@example.com')`
  );
}
```

A simple Select query

```js
async function getUsers() {
  const pool = pg.getPool(config);
  const params = new pg.Params({
    username: "jeswin"
  });
  const { rows } = await pool.query(
    `SELECT * FROM "appusers" WHERE username=${params.id("username")}`,
    params.values()
  );
}
```

Insert Statements

```js
async function createAccount() {
  const pool = pg.getPool(config);
  const params = new pg.Params({
    email: "jeswin@example.com",
    password: "secretive",
    username: "jeswin"
  });
  const { rows } = await pool.query(
    `INSERT INTO account (${params.columns()}) VALUES (${params.ids()})`,
    params.values()
  );
}
```

Transactions. If there's an exception, everything within the transaction is rolled back automatically.

```js
async addTwoUsers() {
  pg.createPool(config);

  const pool = pg.getPool(config);

  await pg.withTransaction(async client => {
    await client.query(`INSERT INTO account (
      username, password, email) VALUES ('user1', 'secretive1', 'user1@example.com')`);
    await client.query(`INSERT INTO account (
      username, password, email) VALUES ('user2', 'secretive2', 'user2@example.com')`);
  }, config);
}
```