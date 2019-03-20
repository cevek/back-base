export type QueryResult<T, Keys extends keyof T> = [Keys] extends [never] ? T : Pick<T, Keys>;
export type DBValue = DBValueBase | DBValueBase[];
type DBValueBase = string | number | boolean | Date | undefined;
export type Keys<T> = Extract<keyof T, string>;

export type CollectionConstraint = { id: string; [key: string]: DBValue };
export interface DBCollection<T extends CollectionConstraint> {
	genId(): T['id'];
	findById<K extends Keys<T> = never>(id: T['id'], other?: { select?: ReadonlyArray<K> }): Promise<QueryResult<T, K>>;
	findOne<K extends Keys<T> = never>(where: WhereOr<T>, other?: Other<T, K>): Promise<QueryResult<T, K>>;
	findAll<K extends Keys<T> = never>(where: WhereOr<T>, other?: Other<T, K>): Promise<QueryResult<T, K>[]>;

	findByIdOrNull<K extends Keys<T> = never>(
		id: T['id'],
		other?: { select?: ReadonlyArray<K> },
	): Promise<QueryResult<T, K> | undefined>;
	findOneOrNull<K extends Keys<T> = never>(
		where: WhereOr<T>,
		other?: Other<T, K>,
	): Promise<QueryResult<T, K> | undefined>;

	update(id: T['id'], data: Partial<T>): Promise<void>;
	remove(id: T['id']): Promise<void>;
	// removeAll(where: WhereOr<T>): Promise<void>;
	create(data: T): Promise<void>;
}

export type WhereOr<T extends { id: string }> = Where<T> | Where<T>[];

type NumOperators = {
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

type DateOperators = {
	ne?: Date;
	gt?: Date;
	gte?: Date;
	lt?: Date;
	lte?: Date;
	between?: [Date, Date];
	notBetween?: [Date, Date];
	in?: Date[];
	notIn?: Date[];
};

type BoolOperators = {
	ne?: number;
};
type StrOperators = {
	in?: string[];
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
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	overlap?: T;
	contained?: T;
};
export type AllOperators = NumOperators & StrOperators & ArrOperators<number> & BoolOperators & DateOperators;

export type WhereItem<T> = T extends number
	? NumOperators | number
	: (T extends string
			? StrOperators | T
			: (T extends Date ? DateOperators : (T extends Array<infer V> ? ArrOperators<V[]> | V[] : never)));

export type Where<T> = { [P in keyof T]?: T[P] | WhereItem<T[P]> };

export type Other<T, Fields extends Keys<T>> = {
	select?: ReadonlyArray<Fields>;
	order?: { desc?: Keys<T>; asc?: Keys<T> };
	limit?: number;
	offset?: number;
};

export class DBEntityNotFound extends Error {
	constructor(public entityName: string, public cond: string) {
		super(`Entity is not found: ${entityName} ${cond}`);
	}
}
export class DBQueryError extends Error {
	constructor(public query: string, public values: DBValue[], public error: string) {
		super(`SQL Error`);
	}
}
