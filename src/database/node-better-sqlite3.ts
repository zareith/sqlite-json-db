import { Base } from "./base.js";
import BetterSqlite3DB from "better-sqlite3";

export * from "./base.js";
export * from "../index.js";
export { BetterSqlite3DB };

export default class NodeSqlite3Database extends Base {
    private db: BetterSqlite3DB.Database;

    constructor(dbPath = ":memory:") {
        super();
        this.db = new BetterSqlite3DB(dbPath);
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
