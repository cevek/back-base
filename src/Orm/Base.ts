export type Fields<T> = { [P in keyof T]: unknown };
export type QueryResult<T, Keys extends keyof T> = [Keys] extends [never] ? T : Pick<T, Keys>;
export type DBValue = DBValueBase | DBValueBase[];
type DBValueBase = string | number | boolean | Date | undefined;

export type CollectionConstraint = { id: string; [key: string]: DBValue };
export interface DBCollection<T extends CollectionConstraint> {
	genId(): T['id'];
	fields: Fields<T>;
	findById<Keys extends keyof T>(id: T['id'], other?: { select?: ReadonlyArray<Keys> }): Promise<QueryResult<T, Keys>>;
	findOne<Keys extends keyof T>(where: WhereOr<T>, other?: Other<T, Keys>): Promise<QueryResult<T, Keys>>;
	findAll<Keys extends keyof T>(where: WhereOr<T>, other?: Other<T, Keys>): Promise<QueryResult<T, Keys>[]>;

	findByIdOrNull<Keys extends keyof T>(
		id: T['id'],
		other?: { select?: ReadonlyArray<Keys> },
	): Promise<QueryResult<T, Keys> | undefined>;
	findOneOrNull<Keys extends keyof T>(
		where: WhereOr<T>,
		other?: Other<T, Keys>,
	): Promise<QueryResult<T, Keys> | undefined>;

	update(id: T['id'], data: Partial<T>): Promise<void>;
	remove(id: T['id']): Promise<void>;
	// removeAll(where: WhereOr<T>): Promise<void>;
	create(data: T): Promise<void>;
}

export type WhereOr<T extends { id: string }> = Where<T> | Where<T>[];

type NumOperators = {
	eq?: number;
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

export type Other<T, Fields extends keyof T> = {
	select?: ReadonlyArray<Fields>;
	order?: { desc?: keyof T; asc?: keyof T };
	limit?: number;
	offset?: number;
};

export class DBEntityNotFound extends Error {
	constructor(public entityName: string, public cond: string) {
		super(`Entity is not found: ${entityName} ${cond}`);
	}
}
