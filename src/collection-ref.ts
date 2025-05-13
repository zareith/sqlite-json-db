import { randomUUID } from "crypto";
import { DocRef } from "./doc-ref.js";
import { EqQueryCriteria, Query, QueryCriteria } from "./query.js";
import { Base } from "./database/base.js";

export class CollectionRef<TRecord extends object> {

    constructor(
        public db: Base,
        public name: string
    ) {
        if (name.includes('"') || name.includes("'")) {
            throw new Error("Collection name must not include quotes");
        }
    }

    async ensureExists() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS "${this.name}" (
                value TEXT,
                id TEXT NOT NULL PRIMARY KEY
            );
        `);
    }

    async delete() {
        await this.db.run(`DROP TABLE IF EXISTS "${this.name}"`);
    }

    async drop() {
        await this.delete();
    }

    doc(docId?: string) {
        return new DocRef<TRecord>(this, docId || randomUUID());
    }

    where(criteria: QueryCriteria<TRecord>) {
        // Create a Query object and return it
        return new Query<TRecord>(this.db, this.name, criteria);
    }

    whereEq(criteria: EqQueryCriteria<TRecord>) {
        return new Query<TRecord>(this.db, this.name, this.expandEqCriteria(criteria));
    }

    private expandEqCriteria(criteria: EqQueryCriteria<TRecord>) {
        return Object.fromEntries(Object.entries(criteria).map(([key, val]) => [key, { $eq: val }])) as QueryCriteria<TRecord>
    }
}
