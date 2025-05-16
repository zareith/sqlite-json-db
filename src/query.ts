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
        private criteria: QueryCriteria<any>,
    ) { }

    private get db() {
        return this.collection.db;
    }

    public get then() {
        const promise = this.get();
        return promise.then.bind(promise);
    }

    public get catch() {
        const promise = this.get();
        return promise.catch.bind(promise);
    }

    public get finally() {
        const promise = this.get();
        return promise.finally.bind(promise);
    }

    public async get(): Promise<TRecord[]> {
        const { sql, params } = this.getQueryClause(this.criteria);
        const selectQuery = `SELECT * FROM ${this.collection.name} WHERE ${sql}`;
        await this.collection.ensureExists();
        return this.db.query(selectQuery, ...params)
    }

    public onSnapshot(onNext: (docs: TRecord[] | undefined) => void) {
        return this.db.listen("change", (args: ChangeEvent) => {
            if (args.table == this.collection.name) {
                this.get().then(onNext);
            }
        });
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
