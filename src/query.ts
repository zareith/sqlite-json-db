import { CollectionRef } from "./collection-ref.js";
import { ChangeEvent } from "./types.js";

export type StrKey<K> = keyof K & string;

export interface CompQCriteria<TVal> {
    $eq?: TVal,
    $neq?: TVal,
    $lt?: TVal,
    $gt?: TVal,
    $lte?: TVal,
    $gte?: TVal,
    $in?: TVal[]
}

export type BaseQueryCriteria<TRecord extends object> = {
    [K in StrKey<TRecord>]?: CompQCriteria<TRecord[K]>
} | Dict<CompQCriteria<any>>

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

interface QueryParts {
    parts: readonly string[],
    params: readonly any[]
}

export class Query<TRecord extends object> {
    constructor(
        private collection: CollectionRef<TRecord>,
        private opts?: {
            query?: QueryCriteria<any>,
            rawQuery?: QueryParts
            limit?: number
            skip?: number
            sort?: SortCriteria<TRecord>
        }
    ) { }

    private get db() {
        return this.collection.db;
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

    count(): number {
        let params: any[] = [];
        let selectQuery = `SELECT count(*) as count FROM "${this.collection.name}"`;
        const qc = this.getQueryClause()
        if (qc) {
            selectQuery += ` WHERE ${qc.sql}`;
            params = qc.params;
        }
        this.collection.ensureExists();
        const rows = this.db.rawQuery(selectQuery, ...params);
        return rows[0]?.count ?? 0
    }

    get(): TRecord[] {
        const params: any[] = [];
        let selectQuery = `SELECT * FROM "${this.collection.name}"`;
        const qc = this.getQueryClause();
        if (qc) {
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
        this.collection.ensureExists();
        return this.db.query(selectQuery, ...params)
    }

	delete() {
        this.collection.ensureExists();
        const params: any[] = [];
        let query = `DELETE FROM "${this.collection.name}"`;
        const qc = this.getQueryClause();
        if (qc) {
            query += ` WHERE ${qc.sql}`;
            params.push(...qc.params)
        }
        this.db.run(query, ...params)
	}

    update(record: Partial<TRecord>) {
        this.collection.ensureExists();
        let sql = `UPDATE "${this.collection.name}" SET value = json_patch(value, ?)`
        const params = [JSON.stringify(record)];
        const qc = this.getQueryClause();
        if (qc) {
            sql += ` WHERE ${qc.sql}`;
            params.push(...qc.params);
        }
        this.db.run(sql, ...params);
    }

    updateRaw(update: string | TemplateStringsArray, ...params: any[]) {
        this.collection.ensureExists();
        const q = joinQuery({
            parts: typeof update === "string" ? [update] : update,
            params
        });
        let sql = `UPDATE "${this.collection.name}"  SET value = ${q.sql}`;
        const qc = this.getQueryClause();
        if (qc) {
            sql += ` WHERE ${qc.sql}`;
            q.params.push(...qc.params);
        }
        this.db.run(sql, ...q.params);
    }

    onSnapshot(onNext: (docs: TRecord[] | undefined) => void) {
        return this.db.listen("change", (args: ChangeEvent) => {
            if (args.table == this.collection.name) {
                onNext(this.get());
            }
        });
    }

    private getSortClause(criteria: SortCriteria<TRecord>) {
        return Object.entries(criteria)
            .map(([key, dir]) => `json_extract(value, '$.${key}') ${dir}`)
            .join(", ")
    }

    private getQueryClause() {
        if (this.opts?.query) {
            return this.buildQueryClause(this.opts.query)
        }
        if (this.opts?.rawQuery) {
            return joinQuery(this.opts.rawQuery);
        }
        return null;
    }

    private buildQueryClause(criteria: QueryCriteria<any>) {
        const compositeOp = getCompositeOp(criteria);
        const subConds = compositeOp
            ? (criteria as any)[compositeOp]?.map((subCriteria: QueryCriteria<any>) => this.buildQueryClause(subCriteria)) ?? []
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
                    const sqlOp = JsonOpToSqlOpM[op]
                    if (!sqlOp) {
                        throw new Error(`Invalid operator encountered ${op}`)
                    }
                    clauses.push(`json_extract(value, '$.${key}') ${sqlOp} ?`);
                    params.push(param);
                }
            }
			if (!clauses.length) clauses.push(`true`);
            return { sql: clauses.join(" AND "), params }
        }
        return { sql: `false`, params: [] };
    }

}

const JsonOpToSqlOpM: Dict<string> = {
    "$eq": "==",
    "$neq": "<>",
    "$lt": "<",
    "$lte": "<=",
    "$gt": ">",
    "$gte": ">=",
}

export const joinQuery = (q: QueryParts) => {
    const params: any[] = [];
    let sql = "";
    for (let i = 0; i < q.parts.length; i++) {
        const part = q.parts[i];
        if (i < q.parts.length - 1) {
            if (part.at(-1) === "$") {
                // Enable raw interpolation
                sql += part.slice(0, -1);
                sql += q.params[i];
            } else {
                sql += part;
                sql += ' ? '
                params.push(q.params[i]);
            }
        } else {
            sql += part;
        }
    }
    return { sql, params }
}
