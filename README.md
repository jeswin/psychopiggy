# piggies

pg doesn't support named parameters, to keep things lightweight and simple.
However, that makes queries brittle.

piggies contains helper methods to make parameterized queries easier.

## Installation

```bash
npm install piggies
```

## Usage

Here's an example.

```js
import Params from "piggies";

const params = Params({
  name: "jeswin",
  country: "india"
});

const queryText = `
  SELECT * FROM user WHERE 
  name=${params.key("name")} AND 
  country=${params.key("country")}`;

client.query(queryText, params.values());
```

