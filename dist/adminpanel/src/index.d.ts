import { Hono } from 'hono';
type Bindings = {
    ADMIN_DB: D1Database;
    SESSION_SECRET: string;
};
interface D1Database {
    prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{
        results: T[];
    } | null>;
    run(): Promise<void>;
}
declare const app: Hono<{
    Bindings: Bindings;
}, import("hono/types").BlankSchema, "/">;
export default app;
//# sourceMappingURL=index.d.ts.map