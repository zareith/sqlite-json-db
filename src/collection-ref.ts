import { randomUUID } from "crypto";
import { DocRef } from "./doc-ref.js";
import { EqQueryCriteria, Query, QueryCriteria } from "./query.js";
import { Base, ChangeEvent } from "./database/base.js";
import {WithOptional} from "./types.js";

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

    ensureExists() {
        if (this.exists) return;
        this.db.run(`
            CREATE TABLE IF NOT EXISTS "${this.name}" (
                value TEXT,
                id TEXT NOT NULL PRIMARY KEY
            );
        `);
        this.exists = true;
    }

    drop() {
        this.db.run(`DROP TABLE IF EXISTS "${this.name}"`);
    }

    count(): Promise<number> {
        this.ensureExists();
        const rows = this.db.rawQuery(`SELECT count(*) as count FROM "${this.name}"`);
        return rows[0].count ?? 0;
    }

    doc(docId?: string) {
        return new DocRef<TRecord>(this, docId || randomUUID());
    }

	put(docId: string | undefined | null, record: WithOptional<TRecord, "id">) {
		this.ensureExists();
		docId ??= randomUUID();
		this.db.run(`
            INSERT INTO "${this.name}" (id, value)
            VALUES (?, ?)
            ON CONFLICT (id)
            DO UPDATE SET value = excluded.value`,
			docId,
			JSON.stringify({
				...record,
				id: docId
			})
		)
	}

	putAll(records: TRecord[]) {
		for (const record of records) {
			this.put(undefined, record);
		}
	}

    deleteAll(docIds: string[]) {
		if (!docIds.length) return;
		const placeholders = docIds.map(_ => '?').join(", ");
        this.db.run(`
            DELETE FROM "${this.name}" WHERE id in (${placeholders});
        `, ...docIds);
    }

	async docByRowId(rowId: number): Promise<TRecord | null> {
		return this.db.query(
			`SELECT value FROM "${this.name}" WHERE rowid = ?`,
			rowId
		)[0]
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

    all(): TRecord[] {
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
