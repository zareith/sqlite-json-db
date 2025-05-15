# sqlite-json-db

sqlite-json-db is an embedded json database (backed by sqlite) with a mongo inspired minimal query api, and firebase style realtime subscriptions.

## Status:

:warning: Beta (Some APIs subject to change)

## Installation:

For node.js:

```sh
npm install better-sqlite3 sqlite-json-db
```

For bun:

```sh
npm install sqlite-json-db # Works with bun's native sqlite driver
```

## Usage

### Import the right adapter for your environment

```js
// One of:
import Database from "sqlite-json-db/better-sqlite3"; // For node.js
import Database from "sqlite-json-db/bun-sqlite"; // For bun
```

###  Initialize db

```ts
// Uses in-memory database
const db = new Database();

// Pass a file path for a persisted databaes:
const db = new Database("data/sqlite.db");
```

## Create Collections and Set Documents

Collections are created on first insertion of a document.

```ts
// Define an interface for the type of record - this must be JSON compatible.
interface User {
    name: string
    age: number
}

// Now we can define a collection
const users = db.collection<User>("users");
// users is the name of the underlying sqlite table
// which will be created on first access

// We can now create refs to documents
const usersRef = users.doc("1"); // Id is optional - if omitted, random uuid will be used

await usersRef.put({
  name: "John Doe",
  age: 100
});
// Saves the document to db

```

### Get a particular document

```ts
// define ref
const usersRef = db.collection<User>("users").doc("1");
// get
const user = await usersRef.get();
// print
console.log(user); // prints { name: "John Doe", age: 100 };
```

### Update Documents in Collections

```ts
// ref
const usersRef = db.collection<User>("users").doc("123");

// Insert/Replace the complete document
await ref.put({ name: "DERP Doe", age: 100 });
// document in DB is now { name: "DERP Doe", age: 100 }

// Selectively update specific properties
await ref.update({ name: "DERP Doe" });
// document in DB is now { name: "DERP Doe" }
// This will not do anything if the doc is not already present
```

### Delete Documents in Collection

```ts
const db = new Database();

const ref = db.collection("users").doc("deletable");

await ref.put({ username: "deletableUsername", updatedAt: 123123 });

await ref.delete();

const doc = await ref.get();

console.log(doc); // prints null
```

### Listen to real-time updates of documents.

```ts
// ref to doc
const ref = db.collection("users").doc("123");

// snapshot listener returns unsubscribe function
const unsub = ref.onSnapshot((doc) => {
  console.log("Omg the user doc is updating!", doc?.username);
});

await ref.put({ username: "SHEESH Doe", updatedAt: 2 });
// prints: `Omg the user doc is updating! SHEESH Doe`

// unsub
unsub();
```

### Query Documents in a collection by equality comparison

```ts
const usersRef = db.collection("users");

await usersRef.doc().put({
    username: "zareith",
    updatedAt: 234
});

const query = usersRef.where({
    username: {
        $eq: "zareith"
    }
});

const docs = await query.get();

const user = docs[0];

console.log(user.username); // prints `zareith`
```

Besides `$eq` for equality, we can use `$gt`, `$gte`, `$lt`, `$lte`:

```ts
usersRef.where({
    username: {
        $eq: "zareith",
    },
    updatedAt: {
        $gt: 200
    }
}).get();

// Finds all documents where username == "zareith" and updatedAt > 200
````

Complex conditions are possible through `$and` and `$or`:

```javascript
usersRef.where({
    $or: [
        { username: { $eq: "zareith" } },
        { updatedAt: { $gt: 200 } },
    ]
}).get();

// Finds all documents where username == "zareith" OR updatedAt > 200
````

For the common case of find by exact match, whereEq is available as a convenience:

```js
usersRef.whereEq({ username: "zareith" }).get();
```

Equivalent to:

```js
usersRef.where({ username: { $eq: "zareith" }}).get();
```

### License

MIT

### Credits/Inspirations

This library is heavily inspired by doculite by Stefan Bielmeier, and the initial test suite
and API structure were borrowed from there.
