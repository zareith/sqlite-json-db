import type { CollectionRef } from "./collection-ref.js";
import { joinQuery } from "./query.js";
import { ChangeEvent, WithOptional } from "./types.js";

export class DocRef<TRecord extends object> {
    constructor(
        private collection: CollectionRef<TRecord>,
        private docId: string
    ) {
    }

    private get db() {
        return this.collection.db;
    }

    async get(): Promise<TRecord | null> {
        await this.collection.ensureExists();
        const records = await this.db.query(`SELECT value FROM "${this.collection.name}" WHERE id = ?`, this.docId);
        return records[0] ?? null;
    }

    get then() {
        const promise = this.get();
        return promise.then.bind(promise);
    }

    get catch() {
        const promise = this.get();
        return promise.catch.bind(promise);
    }

    get finally() {
        const promise = this.get();
        return promise.finally.bind(promise);
    }

    async getRowId(): Promise<number | null> {
        await this.collection.ensureExists();
        const rows = await this.db.rawQuery(
            `SELECT rowid FROM "${this.collection.name}" WHERE id = ?`,
            this.docId
        );
        return rows[0]?.rowid ?? null;
    }

    async put(record: WithOptional<TRecord, "id">) {
        await this.collection.ensureExists();
        if ("id" in record && record.id) this.docId = `${record.id}`;
        await this.db.run(`
            INSERT INTO "${this.collection.name}" (id, value)
            VALUES (?, ?)
            ON CONFLICT (id)
            DO UPDATE SET value = excluded.value`,
            this.docId,
            JSON.stringify({
                ...record,
                id: this.docId
            })
        )
    }

    async update(record: Partial<TRecord>) {
        await this.collection.ensureExists();
        if ("id" in record && record.id) this.docId = `${record.id}`;
        await this.db.run(`
            UPDATE "${this.collection.name}"
            SET value = json_patch(value, ?)
            WHERE id = ?`,
            JSON.stringify({
                ...record,
                id: this.docId
            }),
            this.docId,
        )
    }

    async updateRaw(update: string | TemplateStringsArray, ...params: any[]) {
        await this.collection.ensureExists();
        const q = joinQuery({
            parts: typeof update === "string" ? [update] : update,
            params
        });
        q.params.push(this.docId);
        await this.db.run(`
            UPDATE "${this.collection.name}"
            SET value = ${q.sql}
            WHERE id = ?`,
            ...q.params
        )
    }

    async delete() {
        await this.collection.ensureExists();
        await this.db.run(`
            DELETE FROM "${this.collection.name}"
            WHERE id = ?`, this.docId);
    }

    onSnapshot(onNext: (snapshot: TRecord | null) => void) {
        return this.db.listen("change", (args: ChangeEvent) => {
            this.getRowId().then((rowId) => {
                if (args.table == this.collection.name && args.rowId == rowId) {
                    this.get().then(onNext);
                }
            });
        });
    }
}
