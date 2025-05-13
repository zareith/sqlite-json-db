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

    async rawQuery(query: string, ...params: any[]) {
        this.logger?.debug("query", query, params)
        return this.db.prepare(query).all(...params);
    }

    async query(query: string, ...params: any[]) {
        const rows = await this.rawQuery(query, params);
        return rows.map((row: any) => JSON.parse(row.value));
    }

    async run(query: string, ...params: any[]) {
        this.logger?.debug("run", query, params)
        await this.db.prepare(query).run(...params);
    }

}
