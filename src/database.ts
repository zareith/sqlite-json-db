import { Database as SQLDb, open } from "sqlite";
import { CollectionRef } from "./collection-ref";
import { MessageFn, PubSub } from "./pubsub";
import {
    ChangeEvent,
    Events,
    UnSubFn,
} from "./types";

export interface QueryWithParams {
    sql: string
    params: any[]
}

export type Logger = Record<
    "debug" | "info" | "warn" | "error",
    (...args: unknown[]) => void
>

export class Database {
    private db: SQLDb | null;
    private logger?: Logger;
    private pubSub;

    constructor() {
        this.db = null;
        this.pubSub = PubSub<Events>();
    }

    setLogger(logger: Logger = console) {
        this.logger = logger;
    }

    private async connectToDatabase(
        filename: string = "sqlite.db"
    ): Promise<SQLDb> {
        const sqlite3 = require("sqlite3").verbose();
        return open({
            filename: filename,
            driver: sqlite3.Database,
        });
    }

    // connect to DB
    private async ensureDb(): Promise<SQLDb> {
        if (this.db) return this.db
        const db = await this.connectToDatabase();
        this.db = db;
        this.db.on("change", (eventType: string, database: string, table: string, rowId: string) => {
            const changeEvent: ChangeEvent = {
                eventType,
                database,
                table,
                rowId,
            };
            this.pubSub.publish("change", changeEvent);
        });
        return db;
    }

    public listen(type: "change", fn: MessageFn<ChangeEvent>): UnSubFn {
        this.pubSub.subscribe(type, fn);
        return () => this.pubSub.unsubscribe(type, fn);
    }

    public collection<TRecord extends object>(collectionName: string) {
        return new CollectionRef<TRecord>(this, collectionName);
    }

    async rawQuery(query: string, ...params: any[]) {
        const db = await this.ensureDb();
        this.logger?.debug("query", query, params)
        return db.all(query, ...params);
    }

    async query(query: string, ...params: any[]) {
        const rows = await this.rawQuery(query, params);
        return rows.map((row) => JSON.parse(row.value));
    }

    async run(query: string, ...params: any[]) {
        const db = await this.ensureDb();
        this.logger?.debug("run", query, params)
        await db.run(query, ...params);
    }
}
