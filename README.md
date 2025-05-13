# sqlite-json-db

sqlite-json-db is an embedded json database (backed by sqlite) with a mongo inspired minimal query api.

# Features

## 1. Initialize a DB

Example:

```javascript
import { Database } from "sqlite-json-db";

// Creates sqlite.db file in the cwd
const db = new Database();
```

## 2. Create Collections and Set Documents

Collections are created on first insertion of a document. They are represented by a SQLite Table.

```javascript
// create ref to the doc. Doc ID optional.

const usersRef = db.collection("users").doc("123");
const refWithoutId = db.collection("users").doc();

// Any valid Javascript object that can be parsed to valid JSON can be inserted as a document.

await usersRef.set({
  username: "John Doe",
  createdAt: "123",
  updatedAt: "123",
});
await refWithoutId.set({ username: "Jane Doe" });
```

## 3. Get a particular document

```javascript
// define ref
const usersRef = db.collection("users").doc("123");
// get
const user = await usersRef.get();
// print
console.log(user); // prints { username: "John Doe" };
```

## 4. Update Documents in Collections

```javascript
// ref
const usersRef = db.collection("users").doc("123");

// Properties existing on both old and new object will be updated.
// Properties only existing on the new object will be added.

// If merge is false, properties only present on the old object will be deleted.
// Merge is true by default

await ref.set({ username: "DERP Doe", updatedAt: "345" }, { merge: true });
// document in DB is now { username: "DERP Doe", updatedAt: "345", createdAt: "123" }

await ref.set({ username: "DERP Doe", updatedAt: "345" }, { merge: false });
// document in DB is now { username: "DERP Doe", updatedAt: "345" }
```

## 5. Delete Documents in Collection

```javascript
const db = new Database();

const ref = db.collection("users").doc("deletable");

await ref.set({ username: "deletableUsername", updatedAt: 123123 });

await ref.delete();

const doc = await ref.get();

console.log(doc); // prints null
```

## 6. Listen to real-time updates of documents.

```javascript
// ref to doc
const ref = db.collection("users").doc("123");

// snapshot listener returns unsubscribe function
const unsub = ref.onSnapshot((doc) => {
  console.log("Omg the user doc is updating!", doc?.username);
});

await ref.set({ username: "SHEESH Doe", updatedAt: 2 });
// prints: `Omg the user doc is updating! SHEESH Doe`

// unsub
unsub();
```

## 7. Query Documents in a collection by equality comparison

```javascript
const usersRef = db.collection("users");

await usersRef.doc().set({
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

```javascript
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

