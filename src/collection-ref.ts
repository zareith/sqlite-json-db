import { randomUUID } from "crypto";
import { DocRef } from "./doc-ref.js";
import { EqQueryCriteria, Query, QueryCriteria } from "./query.js";
import { Base, ChangeEvent } from "./database/base.js";

export class CollectionRef<TRecord extends object> {

    private exists = false;

    constructor(
        public db: Base,
        public name: string
    ) {
        if (name.includes('"') || name.includes("'")) {
            throw new Error("Collection name must not include quotes");
        }
    }

    async ensureExists() {
        if (this.exists) return;
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS "${this.name}" (
                value TEXT,
                id TEXT NOT NULL PRIMARY KEY
            );
        `);
        this.exists = true;
    }

    async delete() {
        await this.db.run(`DROP TABLE IF EXISTS "${this.name}"`);
    }

    async drop() {
        await this.delete();
    }

    async count(): Promise<number> {
        await this.ensureExists();
        const rows = await this.db.rawQuery(`SELECT count(*) as count FROM "${this.name}"`);
        return rows[0].count ?? 0;
    }

    doc(docId?: string) {
        return new DocRef<TRecord>(this, docId || randomUUID());
    }

	async docByRowId(rowId: number): Promise<TRecord | null> {
		return (await this.db.query(
			`SELECT value FROM "${this.name}" WHERE rowid = ?`,
			rowId
		))[0]
	}

    where(query?: QueryCriteria<TRecord>) {
        return new Query<TRecord>(this, { query });
    }

    whereRaw(parts: string | TemplateStringsArray, ...params: any[]) {
        return new Query<TRecord>(this, {
            rawQuery: {
                parts: typeof parts === "string" ? [parts] : parts,
                params,
            }
        })
    }

    whereEq(query: EqQueryCriteria<TRecord>) {
        return new Query<TRecord>(this, {
            query: query ? this.expandEqCriteria(query) : undefined
        });
    }

    async all(): Promise<TRecord[]> {
        return this.where().get();
    }

    private expandEqCriteria(criteria: EqQueryCriteria<TRecord>) {
        return Object.fromEntries(Object.entries(criteria).map(([key, val]) => [key, { $eq: val }])) as QueryCriteria<TRecord>
    }

    public onSnapshot(onNext: (snapshot: TRecord | null) => void) {
        return this.db.listen("change", (args: ChangeEvent) => {
			this.docByRowId(args.rowId).then(onNext)
        });
    }
}
