import { Database as BunSqliteDB } from "bun:sqlite";
import { Base } from "./base.js";

export * from "./base.js";
export * from "../index.js";
export { BunSqliteDB };

export default class BunSqliteDatabase extends Base {
    private db: BunSqliteDB;

    constructor(dbPath = ":memory:") {
        super();
        this.db = new BunSqliteDB(dbPath);
    }

    rawQuery(query: string, ...params: any[]) {
        this.logger?.debug("query", query, params)
        return this.db.prepare(query).all(...params);
    }

    query(query: string, ...params: any[]) {
        const rows = this.rawQuery(query, params);
        return rows.map((row: any) => JSON.parse(row.value));
    }

    run(query: string, ...params: any[]) {
        this.logger?.debug("run", query, params)
        this.db.prepare(query).run(...params);
    }
}
