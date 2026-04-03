import type {CollectionRef} from "./collection-ref.js";
import {joinQuery} from "./query.js";
import {ChangeEvent, WithOptional} from "./types.js";

export class DocRef<TRecord extends object> {
	constructor(
		private collection: CollectionRef<TRecord>,
		private docId: string
	) {
	}

	private get db() {
		return this.collection.db;
	}

	get(): TRecord | null {
		this.collection.ensureExists();
		const records = this.db.query(`SELECT value FROM "${this.collection.name}" WHERE id = ?`, this.docId);
		return records[0] ?? null;
	}

	getRowId(): number | null {
		this.collection.ensureExists();
		const rows = this.db.rawQuery(
			`SELECT rowid FROM "${this.collection.name}" WHERE id = ?`,
			this.docId
		);
		return rows[0]?.rowid ?? null;
	}

	put(record: WithOptional<TRecord, "id">) {
		this.collection.ensureExists();
		if ("id" in record && record.id) this.docId = `${record.id}`;
		this.db.run(`
            INSERT INTO "${this.collection.name}" (id, value)
            VALUES (?, ?)
            ON CONFLICT (id)
            DO UPDATE SET value = excluded.value`,
			this.docId,
			JSON.stringify({
				...record,
				id: this.docId
			})
		)
	}

	update(record: Partial<TRecord>) {
		this.collection.ensureExists();
		if ("id" in record && record.id) this.docId = `${record.id}`;
		this.db.run(`
            UPDATE "${this.collection.name}"
            SET value = json_patch(value, ?)
            WHERE id = ?`,
			JSON.stringify({
				...record,
				id: this.docId
			}),
			this.docId,
		)
	}

	updateRaw(update: string | TemplateStringsArray, ...params: any[]) {
		this.collection.ensureExists();
		const q = joinQuery({
			parts: typeof update === "string" ? [update] : update,
			params
		});
		q.params.push(this.docId);
		this.db.run(`
            UPDATE "${this.collection.name}"
            SET value = ${q.sql}
            WHERE id = ?`,
			...q.params
		)
	}

	delete() {
		this.collection.ensureExists();
		this.db.run(`
            DELETE FROM "${this.collection.name}"
            WHERE id = ?`, this.docId);
	}

	onSnapshot(onNext: (snapshot: TRecord | null) => void) {
		return this.db.listen("change", (args: ChangeEvent) => {
			const rowId = this.getRowId()
			if (args.table == this.collection.name && args.rowId == rowId) {
				onNext(this.get());
			}
		});
	}
}
