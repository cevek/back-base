export type DB<Schema> = DBCollections<Schema> & {
	transaction<T>(trx: (db: DBCollections<Schema>) => Promise<T>, rollback?: () => void): Promise<T>;
	query<T>(query: DBQuery): Promise<T>;
};

export type DBCollections<Schema> = {
	[P in keyof Schema]: Schema[P] extends { id: string } ? DBCollection<Schema[P]> : never
};

export type Result<T, Keys extends keyof T> = [Keys] extends [never] ? T : Pick<T, Keys>;
export type ResultArr<T, Keys extends keyof T> = [Keys] extends [never] ? T[] : Pick<T, Keys>[];
export interface DBCollection<T extends { id: string }> {
	genId(): T['id'];
	findById<Keys extends keyof T>(fields: Keys[], id: T['id']): Promise<Result<T, Keys>>;
	findOne<Keys extends keyof T>(fields: Keys[], where: WhereOr<T>, other?: Other<T>): Promise<Result<T, Keys>>;
	findAll<Keys extends keyof T>(fields: Keys[], where: WhereOr<T>, other?: Other<T>): Promise<ResultArr<T, Keys>>;

	findByIdOrNull<Keys extends keyof T>(fields: Keys[], id: T['id']): Promise<Result<T, Keys> | undefined>;
	findOneOrNull<Keys extends keyof T>(
		fields: Keys[],
		where: WhereOr<T>,
		other?: Other<T>,
	): Promise<Result<T, Keys> | undefined>;

	update(id: T['id'], data: Partial<T>): Promise<void>;
	remove(id: T['id']): Promise<void>;
	// removeAll(where: WhereOr<T>): Promise<void>;
	create(data: T): Promise<void>;
}

export interface DBClient {
	query<T>(query: string, values?: unknown[]): Promise<T>;
	release(): void;
}

export type DBValue = string | number | boolean | Date | undefined | DBRaw | DBQuery | DBQueries;

export type WhereOr<T extends { id: string }> = Where<T> | Where<T>[];

type NumOperators = {
	eq?: number;
	// or?: number[];
	ne?: number;
	gt?: number;
	gte?: number;
	lt?: number;
	lte?: number;
	between?: [number, number];
	notBetween?: [number, number];
	in?: number[];
	notIn?: number[];
};
type BoolOperators = {
	eq?: number;
	ne?: number;
};
type StrOperators = {
	eq?: string;
	// or?: string[];
	ne?: string;
	gt?: string;
	gte?: string;
	lt?: string;
	lte?: string;
	like?: string;
	notLike?: string;
	iLike?: string;
	notILike?: string;
	regexp?: string;
	notRegexp?: string;
	iRegexp?: string;
	notIRegexp?: string;
};
type ArrOperators<T> = {
	contains?: T;
	eq?: T;
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	overlap?: T;
	contained?: T;
};
export type AllOperators = NumOperators & StrOperators & ArrOperators<number> & BoolOperators;

export type WhereItem<T> = T extends number
	? NumOperators | number
	: T extends string
	? StrOperators | T
	: T extends Array<infer V>
	? ArrOperators<V[]> | V[]
	: never;

export type Where<T> = { [P in keyof T]?: T[P] | WhereItem<T[P]> };

export type Other<T> = {
	order?: { desc?: keyof T; asc?: keyof T };
	limit?: number;
	offset?: number;
};

export class DBRaw {
	constructor(public readonly raw: string) {}
}

export function query(strs: TemplateStringsArray, ...inserts: (DBValue | DBValue[])[]) {
	return new DBQuery(strs, inserts);
}

export class DBQuery {
	constructor(public parts: ReadonlyArray<string>, public readonly values: unknown[]) {}
}
export class DBQueries {
	constructor(public queries: DBQuery[], public separator: string | undefined) {}
}

export function joinQueries(queries: DBQuery[], separator?: string): DBQuery {
	return query`${new DBQueries(queries, separator)}`;
}

export interface DBOptions<Schema> {
	getClient: () => Promise<DBClient>;
	client?: DBClient;
	runTransaction: <T>(
		options: DBOptions<Schema>,
		trx: (db: DBCollections<Schema>) => Promise<T>,
		rollback?: () => void,
	) => Promise<T>;
	CollectionClass: new (name: string, client: DBClient) => DBCollection<{ id: string }>;
}
export async function createDB<Schema>(options: DBOptions<Schema>) {
	const db = {} as DB<Schema>;
	const dbClient = await options.getClient();
	db.transaction = (trx, rollback) => options.runTransaction(options, trx, rollback);
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key];
			if (collection === undefined) {
				const newCollection = new options.CollectionClass(key as string, dbClient);
				db[key] = newCollection as DB<Schema>[keyof Schema];
				return newCollection;
			}
			return collection;
		},
	});
}

export class DBEntityNotFound extends Error {
	constructor(public entityName: string, public cond: string) {
		super(`Entity is not found: ${entityName} ${cond}`);
	}
}
