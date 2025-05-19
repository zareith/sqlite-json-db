import { CollectionRef } from "./collection-ref.js";
import { Base } from "./database/base.js";
import { ChangeEvent } from "./types.js";

export type BaseQueryCriteria<TRecord extends object> = {
    [K in keyof TRecord]?: {
        $eq?: TRecord[K],
        $neq?: TRecord[K],
        $lt?: TRecord[K],
        $gt?: TRecord[K],
        $lte?: TRecord[K],
        $gte?: TRecord[K],
        $in?: TRecord[K][]
    }
}

export type CompositeQueryCriteria<TRecord extends object> =
    | { $and: QueryCriteria<TRecord>[] }
    | { $or: QueryCriteria<TRecord>[] };

export type QueryCriteria<TRecord extends object> =
    | BaseQueryCriteria<TRecord>
    | CompositeQueryCriteria<TRecord>

export type BaseEqQueryCriteria<TRecord extends object> = {
    [K in keyof TRecord]?: TRecord[K]
}

export type CompositeEqQueryCriteria<TRecord extends object> =
    | { $and: EqQueryCriteria<TRecord>[] }
    | { $or: EqQueryCriteria<TRecord>[] }

export type EqQueryCriteria<TRecord extends object> =
    | BaseEqQueryCriteria<TRecord>
    | CompositeEqQueryCriteria<TRecord>

export type SortCriteria<TRecord extends object> =
    { [K in keyof TRecord]?: "ASC" | "DESC" }

export const getCompositeOp = (criteria: any) => {
    const keys = Object.keys(criteria);
    if (keys.includes("$and")) {
        if (keys.length > 1)
            throw new Error("$and or $or can not be combined with other operators")
        return "$and"
    }
    if (keys.includes("$or")) {
        if (keys.length > 1)
            throw new Error("$and or $or can not be combined with other operators")
        return "$or"
    }
    return null;
}

export class Query<TRecord extends object> {
    constructor(
        private collection: CollectionRef<TRecord>,
        private opts?: {
            query?: QueryCriteria<any>,
            limit?: number
            skip?: number
            sort?: SortCriteria<TRecord>
        }
    ) { }

    private get db() {
        return this.collection.db;
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

    skip(skip: number | undefined) {
        return new Query<TRecord>(this.collection, {
            ...this.opts,
            skip
        });
    }

    offset(skip: number) {
        return this.skip(skip);
    }

    limit(limit: number) {
        return new Query<TRecord>(this.collection, {
            ...this.opts,
            limit
        })
    }

    sort(sort: SortCriteria<TRecord>) {
        return new Query<TRecord>(this.collection, {
            ...this.opts,
            sort
        })
    }

    orderBy(criteria: SortCriteria<TRecord>) {
        return this.sort(criteria);
    }

    async count(): Promise<number> {
        let params: any[] = [];
        let selectQuery = `SELECT count(*) as count FROM "${this.collection.name}"`;
        if (this.opts?.query) {
            const qc = this.getQueryClause(this.opts.query);
            selectQuery += ` WHERE ${qc.sql}`;
            params = qc.params;
        }
        await this.collection.ensureExists();
        const rows = await this.db.rawQuery(selectQuery, ...params)
        console.log("Count:", rows, selectQuery)
        return rows[0]?.count ?? 0
    }

    async get(): Promise<TRecord[]> {
        const params: any[] = [];
        let selectQuery = `SELECT * FROM "${this.collection.name}"`;
        if (this.opts?.query) {
            const qc = this.getQueryClause(this.opts.query);
            selectQuery += ` WHERE ${qc.sql}`;
            params.push(...qc.params)
        }
        if (this.opts?.sort) {
            selectQuery += ` ORDER BY ${this.getSortClause(this.opts.sort)}`
        }
        if (this.opts?.limit) {
            selectQuery += ` LIMIT ?`
            params.push(this.opts.limit)
        }
        if (this.opts?.skip) {
            if (!this.opts?.limit) {
                selectQuery += ` LIMIT -1`
            }
            selectQuery += ` OFFSET ?`
            params.push(this.opts.skip)
        }
        await this.collection.ensureExists();
        return this.db.query(selectQuery, ...params)
    }

    onSnapshot(onNext: (docs: TRecord[] | undefined) => void) {
        return this.db.listen("change", (args: ChangeEvent) => {
            if (args.table == this.collection.name) {
                this.get().then(onNext);
            }
        });
    }

    private getSortClause(criteria: SortCriteria<TRecord>) {
        return Object.entries(criteria)
            .map(([key, dir]) => `json_extract(value, '$.${key}') ${dir}`)
            .join(", ")
    }

    private getQueryClause(criteria: QueryCriteria<any>) {
        const compositeOp = getCompositeOp(criteria);
        const subConds = compositeOp
            ? (criteria as any)[compositeOp]?.map((subCriteria: QueryCriteria<any>) => this.getQueryClause(subCriteria)) ?? []
            : null;
        if (compositeOp && subConds?.length) {
            const sqlOp = compositeOp === "$and" ? "AND" : "OR";
            let sql: string = "";
            const params: any[] = [];
            for (const sq of subConds) {
                if (!sq.sql) continue;
                if (sql) sql += ` ${sqlOp} ${sq.sql}`;
                else sql = sq.sql;
                if (sq.params.length) params.push(...sq.params);
            }
            return {
                sql: `(${sql})`,
                params,
            }
        }
        if (!compositeOp) {
            const clauses: string[] = [];
            const params: any[] = [];
            for (const [key, cond] of Object.entries(criteria)) {
                if (cond == null) continue;
                for (const [op, param] of Object.entries(cond)) {
                    if (op === "$in") {
                        if (!Array.isArray(param) || !param.length) {
                            clauses.push(`false`);
                            continue;
                        }
                        let clause = `json_extract(value, '$.${key}') IN (`;
                        for (let i = 0; i < param.length; i++) {
                            clause += '?';
                            if (i < param.length - 1) clause += ', ';
                            params.push(param[i]);
                        }
                        clause += ')';
                        clauses.push(clause);
                        continue;
                    }
                    const sqlOp = this.getOperator(op)
                    clauses.push(`json_extract(value, '$.${key}') ${sqlOp} ?`);
                    params.push(param);
                }
            }
            return { sql: clauses.join(" AND "), params }
        }
        return { sql: `false`, params: [] };
    }

    private getOperator(op: string) {
        switch (op) {
            case "$eq": return "==";
            case "$neq": return "<>";
            case "$lt": return "<";
            case "$lte": return "<=";
            case "$gt": return ">";
            case "$gte": return ">=";
        }
        throw new Error("Unsupported operator " + op)
    }

}
