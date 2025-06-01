import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Base } from "../src/database/base";

interface User {
    name: string
    age: number
    address?: {
        houseNo: number
        city: string
        country: string
        zipCode: string
    }
}

export function Suite(Database: { new(): Base }) {
    describe("Query", () => {
        it("supports filtering by different operators", async () => {
            const db = new Database();
            const usersRef = db.collection<User>("app_users");
            await usersRef.doc().put({
                name: "A",
                age: 10,
                address: {
                    houseNo: 100,
                    city: "TVS",
                    country: "US",
                    zipCode: "111111"
                }
            });
            await usersRef.doc().put({ name: "B", age: 20 });
            await usersRef.doc().put({ name: "C", age: 30 });
            const query1 = usersRef.where({ name: { $eq: "A" } });
            const docs = await query1.get();
            assert.deepEqual(docs?.[0]?.name, "A");
            const query2 = usersRef.where({ age: { $gt: 10 } });
            const docs2 = await query2.get();
            assert.deepEqual(docs2.map(_ => _.age), [20, 30])
            const query3 = usersRef.where({ age: { $gte: 10 } });
            const docs3 = await query3.get();
            assert.deepEqual(docs3.map(_ => _.age), [10, 20, 30]);
            const query4 = usersRef.where({ age: { $lt: 10 } })
            const docs4 = await query4.get();
            assert.deepEqual(docs4, []);
            const query5 = usersRef.where({ age: { $lte: 10 } })
            const docs5 = await query5.get();
            assert.deepEqual(docs5.map(_ => _.age), [10])

            const query6 = usersRef.where({
                "address.city": { $eq: "TVS" },
                "address.country": { $eq: "US" }
            })
            const docs6 = await query6.get();
            assert.deepEqual(docs6[0].name, "A")
        });

        it("supports compact form for query by equality", async () => {
            const db = new Database();
            const users = db.collection<User>("users");
            await users.doc().put({ name: "john doe", age: 10 });
            await users.doc().put({ name: "zareith", age: 234 });

            const query = users.whereEq({ name: "zareith" });
            const docs = await query.get();
            assert.strictEqual(docs.length, 1)
            assert.strictEqual(docs[0]?.name, "zareith");

            const query1 = users.whereEq({ name: "zareith", age: 234 });
            const docs1 = await query1.get();
            assert.strictEqual(docs1.length, 1)
            assert.strictEqual(docs[0]?.name, "zareith");
        });

        it("supports composite queries", async () => {
            const db = new Database();
            const users = db.collection<User>("users");
            await users.doc().put({ name: "John", age: 10 });
            await users.doc().put({ name: "Kennedy", age: 45 });
            await users.doc().put({ name: "Sita", age: 20 });
            const query = users.where({
                $or: [{
                    name: { $eq: "John" }
                }, {
                    age: { $gte: 40 }
                }]
            })
            assert.strictEqual(await query.count(), 2)
            const docs = await query.get();
            assert(docs.find(_ => _.name === "Sita") == null)
            assert(docs.find(_ => _.name === "John") != null)
            assert(docs.find(_ => _.name === "Kennedy") != null)
        })

        it("supports skip and limit", async () => {
            const db = new Database();
            const users = db.collection<User>("users");
            // Insert 100 users aged 1-100
            for (let i = 0; i < 100; i++) {
                await users.doc().put({ name: "User" + (i + 1), age: i + 1 });
            }
            const query = users.where({
                age: { $gte: 50 }
            })
            const count1 = await query.count();
            assert.strictEqual(count1, 51);
            const rows1 = await query.get();
            assert.strictEqual(rows1.length, 51);
            assert.strictEqual(rows1[0].name, "User50")

            const q2 = query.limit(10).skip(10);
            const rows2 = await q2.get();
            assert.strictEqual(rows2[0].name, "User60")

            const q3 = query.skip(10).limit(10);
            const rows3 = await q3.get();
            assert.strictEqual(rows3[0].name, "User60")
            assert.strictEqual(rows3[rows3.length - 1].name, "User69")
        })

        it("supports ordering", async () => {
            const db = new Database();
            const users = db.collection<User>("users");
            await users.doc().put({ name: "A", age: 15 });
            await users.doc().put({ name: "B", age: 10 })
            await users.doc().put({ name: "C", age: 20 })

            const r1 = await users
                .where()
                .sort({ name: "ASC" })
                .get()
            assert.deepEqual(r1.map(_ => _.name), ["A", "B", "C"])
            const r2 = await users
                .where()
                .sort({ name: "DESC" })
                .get()
            assert.deepEqual(r2.map(_ => _.name), ["C", "B", "A"])
            const r3 = await users
                .where()
                .sort({ age: "ASC" })
                .get()
            assert.deepEqual(r3.map(_ => _.name), ["B", "A", "C"])
        })

        it("supports raw sql", async () => {
            const db = new Database();
            const users = db.collection<User>("users");
            await users.doc().put({ name: "A", age: 15 });
            await users.doc().put({ name: "B", age: 10 })
            await users.doc().put({ name: "C", age: 20 })
            const r1 = await users.whereRaw`value ->> 'name' = ${"A"}`.get()
            assert(r1.length === 1);
            assert(r1[0].name === "A");
            const r2 = await users.whereRaw`value ->> 'name' = ${"A"} or value ->> 'age' = ${10}`.get()
            assert(r2.length === 2);
            assert(r2[0].name === "A");
            assert(r2[1].name === "B");
        })
    });

    describe("DocRef", () => {
        it("notifies subscriber of changes in doc", async () => {
            const db = new Database();
            const usersRef = db.collection<User>("users").doc("123");
            await usersRef.put({ name: "John Doe", age: 123123 });
            const ref = db.collection<User>("users").doc("123");
            const unsub = ref.onSnapshot((doc) => {
                console.log("Omg the user doc is updating!", doc);
                assert.strictEqual(doc?.name, "JANE Doe");
            });
            await ref.put({ name: "JANE Doe", age: 1 });
            unsub();
        });
        it("allows crud operations", async () => {
            const db = new Database();
            const ref = db.collection<User>("users").doc("deletable");
            await ref.put({ name: "John Doe", age: 123 });
            await ref.delete();
            const doc = await ref.get();
            assert.strictEqual(doc, null);
        });
        it("should get null if it doesn't exist!", async () => {
            const db = new Database();
            const usersRef = db.collection("users").doc("22");
            const user = await usersRef.get();
            assert.strictEqual(user, null);
        });
        it("should get an old doc", async () => {
            const db = new Database();
            const oldUsersRef = db.collection<User>("users").doc("123");
            await oldUsersRef.put({ name: "John Doe", age: 12 });
            const users = db.collection<User>("users").doc("123");
            let user = await users.get();
            assert.strictEqual(user?.name, "John Doe");
            await oldUsersRef.update({ name: "Jane Doe" });
            user = await users.get();
            assert.strictEqual(user?.name, "Jane Doe");
        });
        it("should get a doc", async () => {
            const db = new Database();
            const usersRef = db.collection<User>("users").doc("derp");
            await usersRef.put({
                name: "Johnny Derp",
                age: 123123,
            });
            const user = await usersRef.get();
            assert.strictEqual(user?.name, "Johnny Derp");
            assert.strictEqual(user?.age, 123123);
        });
        it("should be able to update the doc", async () => {
            const db = new Database();
            const usersRef = db.collection<{ lit: boolean }>("users").doc("derp");
            await usersRef.put({ lit: true });
            await usersRef.update({ lit: false });
            const user = await usersRef.get();
            assert.strictEqual(user!.lit, false);
        });
        it("supports updating by raw sql", async () => {
            const db = new Database();
            const users = db.collection<User>("users")
            const userRef = users.doc("1");
            await userRef.put({
                name: "Johnny Derp",
                age: 123123,
            });
            const addr = {
                houseNo: 1,
                city: "TVC",
                country: "US",
                zipCode: "111"
            }
            await users.doc("1").updateRaw`json_set(value, '$.address', json(${JSON.stringify(addr)}))`
            const retrieved = await userRef.get();
            assert.deepEqual(retrieved?.address, addr);
        })
    });

    describe("CollectionRef", () => {
        it("supports count of rows", async () => {
            const db = new Database();
            const users = db.collection<{
                name: string,
                age: number
            }>("app_users");
            assert.strictEqual(await users.count(), 0);
            await users.doc("1").put({ name: "Harry", age: 10 })
            assert.strictEqual(await users.count(), 1);
            await users.doc("1").put({ name: "Harry", age: 11 })
            assert.strictEqual(await users.count(), 1);
            await users.doc("2").put({ name: "Ron", age: 11 })
            assert.strictEqual(await users.count(), 2);
        })
    })

}
