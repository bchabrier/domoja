import { Duration, parseDuration } from './durationParser';

import { colorConsole } from 'tracer';

const logger = colorConsole({
    dateformat: "dd/mm/yyyy HH:MM:ss.l",
    level: 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

// hack to neutralize persistence when app is in demo mode
let demoMode: boolean = false;

export function setDemoMode(mode: boolean) {
    demoMode = mode;
}

export type Strategy = "raw" | "aggregate";

export const ALL_AGGREGATION_TYPES = ["year", "month", "week", "day", "hour", "minute", "change", "none"] as const;
export type AggregationType = (typeof ALL_AGGREGATION_TYPES)[number];

export abstract class persistence {
    id: string;
    ttl: number;
    strategy: Strategy;
    keep: Duration;
    keepString: string;
    keepAggregation: Duration;
    keepAggregationString: string;
    cleanJob: NodeJS.Timeout;

    constructor(id: string, ttl?: number, strategy?: Strategy, keep?: string) {
        this.strategy = strategy || "raw";
        this.id = id;
        this.ttl = ttl > 0 ? ttl : 1 * 60; // 1h by default

        if (keep) {
            if (this.strategy === 'aggregate') {
                const keepTab = keep.split(',');
                this.keepString = keepTab[0];
                this.keep = this.keepString && parseDuration(this.keepString);
                this.keepAggregationString = keepTab[1];
                this.keepAggregation = this.keepAggregationString && parseDuration(this.keepAggregationString);
            } else {
                this.keepString = keep;
                this.keep = parseDuration(this.keepString);
                this.keepAggregationString = undefined;
                this.keepAggregation = undefined;
            }
        }

        if (strategy) {
            if (this.keep === undefined) {
                this.keepString = '1 year';
                this.keep = Duration.fromObject({ year: 1 }); // 1 year by default
            }
            if (this.keepAggregation === undefined) {
                this.keepAggregationString = '5 years';
                this.keepAggregation = Duration.fromObject({ year: 5 }); // 5 years by default
            }
        }

        this.cleanJob = setInterval(() => {
            this.cleanOldData((err) => {
                if (err) logger.warn('Could not clean history of "%s":', this.id, err);
            });
        }, 24 * 60 * 60 * 1000).unref();
        setTimeout(() => {
            this.cleanOldData((err) => {
                if (err) logger.warn('Could not clean history of "%s":', this.id, err);
            });
        }, 5 * 60 * 1000).unref(); // run once after 5 minutes, don't block event loop
    }
    insert(record: { date: Date, state: any }): Promise<Object>;
    insert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    insert(record: { date: Date, state: any }, callback?: (err: Error, doc: Object) => void): void | Promise<Object> {
        if (demoMode) {
            if (callback) return callback(null, undefined);
            else return new Promise<Object>((resolve) => resolve(undefined));
        }
        return this.doInsert(record, callback);
    }
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null): Promise<any[]>;
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    getHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback?: (err: Error, results: any[]) => void): void | Promise<any[]> {
        if (demoMode) {
            if (callback) return callback(null, []);
            else return new Promise<any[]>((resolve) => resolve([]));
        }
        return this.doGetHistory(aggregate, from, to, callback);
    }
    restoreStateFromDB(): Promise<{ id: string, state: string | Date, date: Date }>;
    restoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;
    restoreStateFromDB(callback?: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void | Promise<{ id: string, state: string | Date, date: Date }> {
        if (demoMode) {
            if (callback) return callback(null, undefined);
            else return new Promise<{ id: string, state: string | Date, date: Date }>((resolve) => resolve(undefined));
        }
        return this.doRestoreStateFromDB(callback);
    }
    backupStateToDB(state: string | Date): Promise<void>;
    backupStateToDB(state: string | Date, callback: (err: Error) => void): void;
    backupStateToDB(state: string | Date, callback?: (err: Error) => void): void | Promise<void> {
        if (demoMode) {
            if (callback) return callback(null);
            else return new Promise<void>((resolve) => resolve());
        }
        return this.doBackupStateToDB(state, callback);
    }
    cleanOldData(): Promise<void>;
    cleanOldData(callback: (err: Error) => void): void;
    cleanOldData(callback?: (err: Error) => void): void | Promise<void> {
        if (demoMode) {
            if (callback) return callback(null);
            else return new Promise<void>((resolve) => resolve());
        }
        return this.doCleanOldData(callback);
    }
    abstract doInsert(record: { date: Date, state: any }): Promise<Object>;
    abstract doInsert(record: { date: Date, state: any }, callback: (err: Error, doc: Object) => void): void;
    abstract doInsert(record: { date: Date, state: any }, callback?: (err: Error, doc: Object) => void): void | Promise<Object>;

    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null): Promise<any[]>;
    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback: (err: Error, results: any[]) => void): void;
    abstract doGetHistory(aggregate: AggregationType, from: Date | null, to: Date | null, callback?: (err: Error, results: any[]) => void): void | Promise<any[]>;

    abstract doRestoreStateFromDB(): Promise<{ id: string, state: string | Date, date: Date }>;
    abstract doRestoreStateFromDB(callback: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void;
    abstract doRestoreStateFromDB(callback?: (err: Error, result: { id: string, state: string | Date, date: Date }) => void): void | Promise<{ id: string, state: string | Date, date: Date }>;

    abstract doBackupStateToDB(state: string | Date): Promise<void>;
    abstract doBackupStateToDB(state: string | Date, callback: (err: Error) => void): void;
    abstract doBackupStateToDB(state: string | Date, callback?: (err: Error) => void): void | Promise<void>;

    abstract doCleanOldData(): Promise<void>;
    abstract doCleanOldData(callback: (err: Error) => void): void;
    abstract doCleanOldData(callback?: (err: Error) => void): void | Promise<void>;

    release() {
        clearInterval(this.cleanJob);
        this.cleanJob = null;
    }
}

