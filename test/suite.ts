import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Base } from "../src/database/base";

export function Suite(Database: { new(): Base }) {
    describe("listener", () => {
        it("should listen", async () => {
            const db = new Database();
            const usersRef = db.collection("users").doc("123");
            await usersRef.set({ username: "John Doe", updatedAt: 123123 });
            const ref = db.collection("users").doc("123");
            const unsub = ref.onSnapshot((doc) => {
                console.log("Omg the user doc is updating!", doc);
                assert.strictEqual(doc?.username, "JANE Doe");
            });
            await ref.set({ username: "JANE Doe", updatedAt: 1 }, { merge: false });
            unsub();
        });
    });
    describe("should delete", () => {
        it("should delete", async () => {
            const db = new Database();
            const ref = db.collection("users").doc("deletable");
            await ref.set({ username: "John Doe", updatedAt: 123123 });
            await ref.delete();
            const doc = await ref.get();
            assert.strictEqual(doc, null);
        });
    });

    describe("query", () => {
        it("should query", async () => {
            const db = new Database();
            const usersRef = db.collection<{
                username: string,
                updatedAt: number
            }>("users");
            await usersRef.doc().set({ username: "zareith", updatedAt: 234 });
            const query = usersRef.where({ username: { $eq: "zareith" } });
            const docs = await query.get();
            assert.strictEqual(docs?.[0]?.username, "zareith");
        });
        it("should query by equality", async () => {
            const db = new Database();
            const usersRef = db.collection<{
                username: string,
                updatedAt: number
            }>("users");
            await usersRef.doc().set({ username: "zareith", updatedAt: 234 });
            const query = usersRef.whereEq({ username: "zareith" });
            const docs = await query.get();
            assert.strictEqual(docs?.[0]?.username, "zareith");
        });
        it("supports composite queries", async () => {
            const db = new Database();
            const usersRef = db.collection<{
                name: string,
                age: number
            }>("users");
            await usersRef.doc().set({ name: "John", age: 10 });
            await usersRef.doc().set({ name: "Kennedy", age: 45 });
            await usersRef.doc().set({ name: "Sita", age: 20 });
            const docs = await usersRef.where({
                $or: [{
                    name: { $eq: "John" }
                }, {
                    age: { $gte: 40 }
                }]
            }).get();
            console.log("docs:", docs);
            assert(docs.find(_ => _.name === "Sita") == null)
            assert(docs.find(_ => _.name === "John") != null)
            assert(docs.find(_ => _.name === "Kennedy") != null)
        })
    });

    describe("docRef", () => {
        it("should get null if it doesn't exist!", async () => {
            const db = new Database();
            const usersRef = db.collection("users").doc("22");
            const user = await usersRef.get();
            assert.strictEqual(user?.username, undefined);
            assert.strictEqual(user, null);
        });
        it("should get an old doc", async () => {
            const db = new Database();
            const oldUsersRef = db.collection("users").doc("123");
            await oldUsersRef.set({ username: "John Doe", updatedAt: 123123 });
            const usersRef = db.collection("users").doc("123");
            let user = await usersRef.get();
            assert.strictEqual(user?.username, "John Doe");
            await oldUsersRef.set({ username: "Jane Doe" });
            user = await usersRef.get();
            assert.strictEqual(user?.username, "Jane Doe");
        });
        it("should get a doc", async () => {
            const db = new Database();
            const usersRef = db.collection("users").doc("derp");
            await usersRef.set({
                username: "Johnny Derp",
                updatedAt: 123123,
                lit: true,
            });
            const user = await usersRef.get();
            assert.strictEqual(user?.username, "Johnny Derp");
            assert.strictEqual(user?.lit, true);
        });
        it("should be able to update the docc", async () => {
            const db = new Database();
            const usersRef = db.collection("users").doc("derp");
            await usersRef.set({ lit: false });
            const user = await usersRef.get();
            assert.strictEqual(user?.lit, false);
        });
    });
}
