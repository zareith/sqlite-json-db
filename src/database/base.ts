import { CollectionRef } from "../collection-ref.js";
import { MessageFn, PubSub } from "../pubsub.js";
import type {
    ChangeEvent,
    Events,
    Logger,
    UnSubFn,
} from "../types.js";
export type {
    ChangeEvent,
    Events,
    UnSubFn,
}

export interface QueryWithParams {
    sql: string
    params: any[]
}

export abstract class Base {
    protected logger?: Logger;
    private pubSub;

    constructor() {
        this.pubSub = PubSub<Events>();
    }

    setLogger(logger: Logger = console) {
        this.logger = logger;
    }

    public listen(type: "change", fn: MessageFn<ChangeEvent>): UnSubFn {
        this.pubSub.subscribe(type, fn);
        return () => this.pubSub.unsubscribe(type, fn);
    }

    public collection<TRecord extends object>(collectionName: string) {
        return new CollectionRef<TRecord>(this, collectionName);
    }

    abstract rawQuery(query: string, ...params: any[]): Promise<any[]>
    abstract query(query: string, ...params: any[]): Promise<any[]>
    abstract run(query: string, ...params: any[]): Promise<void>
}
