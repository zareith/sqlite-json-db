export interface ChangeEvent {
  eventType: string; //"insert"
  database: string; // "main"
  table: string; // "wishlists"
  rowId: string; // position of doc in collection
}

export type Events = {
  change: ChangeEvent;
  profile: string;
};

export type UnSubFn = () => void;
export type EventType = keyof Events;

export interface JsonStoreValue {
  [key: string]: any;
}

export type Logger = Record<
    "debug" | "info" | "warn" | "error",
    (...args: unknown[]) => void
>
