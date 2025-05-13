import type { CollectionRef } from "./collection-ref.js";
import { ChangeEvent, JsonStoreValue } from "./types.js";

type SetOptions = {
  merge: boolean;
};

export class DocRef<TRecord extends object> {
  constructor(
    private collection: CollectionRef<TRecord>,
    private docId: string
  ) {
  }

  private get db() {
    return this.collection.db;
  }

  public async get() {
    await this.collection.ensureExists();
    const records = await this.db.query(`SELECT value FROM "${this.collection.name}" WHERE id = ?`, this.docId);
    return records[0] ?? null;
  }

  public async getRowId() {
    await this.collection.ensureExists();
    const rows = await this.db.rawQuery(
      `SELECT rowid FROM "${this.collection.name}" WHERE id = ?`,
      this.docId
    );
    return rows[0]?.rowid ?? null;
  }

  public async set(
    record: TRecord,
    options: SetOptions = { merge: false }
  ) {
    await this.collection.ensureExists();
    if ("id" in record && record.id) this.docId = `${record.id}`;
    await this.db.run(`
      INSERT INTO "${this.collection.name}" (id, value)
      VALUES (?, ?)
      ON CONFLICT (id)
      DO UPDATE SET value = ${options.merge ? 'json_patch(value, excluded.value)' : 'excluded.value'}
    `,
      this.docId,
      JSON.stringify({
        ...record,
        id: this.docId
      })
    )
  }

  public async delete() {
    await this.collection.ensureExists();
    await this.db.run(`DELETE FROM "${this.collection.name}" WHERE id = ?`, this.docId);
  }

  public onSnapshot(onNext: (snapshot: JsonStoreValue | null) => void) {
    return this.db.listen("change", (args: ChangeEvent) => {
      this.getRowId().then((rowId) => {
        if (args.table == this.collection.name && args.rowId == rowId) {
          this.get().then(onNext);
        }
      });
    });
  }
}
