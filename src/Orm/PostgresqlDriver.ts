import { randomBytes } from 'crypto';
import DataLoader from 'dataloader';
import { readdir, readFile } from 'fs-extra';
import { Exception, BaseException, ClientException, logger } from '../logger';

export type BaseDB<Schema> = Collections<Schema> & {
	transaction: TransactionFun<Schema>;
	query: QueryFun;
};
// export type TransactionDB<Schema> = Collections<Schema> & { query: QueryFun };
export type SchemaConstraint = { [key: string]: CollectionConstraint };
export type Column = DBRaw;

type TransactionFun<Schema> = (
	trx: (db: BaseDB<Schema>) => Promise<void>,
	rollback?: () => Promise<void>,
) => Promise<void>;

type Collections<Schema> = {
	[P in keyof Schema]: Schema[P] extends CollectionConstraint ? Collection<Schema[P]> : never
};

export type QueryResult<T, Keys extends keyof T, CF extends string> = ([Keys] extends [never] ? T : Pick<T, Keys>) &
	{ [P in CF]: string | undefined };
type DBValue = DBValueBase | DBValueBase[];
type DBValueBase = string | number | boolean | Date | undefined;
type Keys<T> = Extract<keyof T, string>;

export type CollectionConstraint = { id: string; [key: string]: DBValue };

type WhereOr<T extends { id: string }> = Where<T> | Where<T>[];

type NumOperators<T = number | DBQuery> = {
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	between?: [T, T];
	notBetween?: [T, T];
	in?: number[];
	notIn?: number[];
};

type DateOperators<T = Date | DBQuery> = {
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	between?: [T, T];
	notBetween?: [T, T];
};

type BoolOperators = {
	ne?: number | DBQuery;
};
type StrOperators<T = string | DBQuery> = {
	in?: string[];
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	like?: T;
	notLike?: T;
	iLike?: T;
	notILike?: T;
	regexp?: T;
	notRegexp?: T;
	iRegexp?: T;
	notIRegexp?: T;
};
type ArrOperators<T = number | DBQuery> = {
	contains?: T;
	ne?: T;
	gt?: T;
	gte?: T;
	lt?: T;
	lte?: T;
	overlap?: T;
	contained?: T;
};
type AllOperators = NumOperators & StrOperators & ArrOperators & BoolOperators & DateOperators;

type WhereItem<T> = T extends number
	? NumOperators | number
	: (T extends string
			? StrOperators | T
			: (T extends Date ? DateOperators : (T extends Array<infer V> ? ArrOperators<V[]> | V[] : never)));

type Where<T> = { [P in keyof T]?: T[P] | WhereItem<T[P]> | DBQuery } | DBQuery;

type Other<T, Fields extends Keys<T>, CustomFields extends string> = {
	select?: ReadonlyArray<Fields>;
	selectCustom?: { [P in CustomFields]: DBQuery };
	order?: { desc?: Keys<T>; asc?: Keys<T> };
	limit?: number;
	offset?: number;
};

// export class DBEntityNotFound extends Error {
// 	constructor(public entityName: string, public cond: string) {
// 		super(`Entity is not found: ${entityName} ${cond}`);
// 	}
// }
// export class DBQueryError extends Error {
// 	constructor(public query: string, public values: DBValue[], public error: string) {
// 		super(`SQL Error: ${error}, query: ${query}, values: ${JSON.stringify(values)}`);
// 	}
// }

export function sql(strs: TemplateStringsArray, ...inserts: QueryValue[]) {
	return new DBQuery(strs, inserts);
}
export function joinQueries(queries: DBQuery[], separator?: DBQuery): DBQuery {
	return sql`${new DBQueries(queries, separator)}`;
}

class Collection<T extends CollectionConstraint> {
	private loader: DataLoader<T['id'], T | undefined>;
	name: Column;
	fields: { [P in keyof T]: Column };
	constructor(public collectionName: string, private query: QueryFun) {
		this.name = dbField(collectionName);
		this.fields = new Proxy({} as this['fields'], {
			get: (_, key: string) => sql`${this.name}.${dbField(key)}`,
		});
		this.loader = new DataLoader(async ids => this.loadById(ids), { cache: false });
	}
	private async loadById(ids: T['id'][]) {
		const rows = await this.findAll({ id: { in: ids } } as Where<T>);
		return ids.map(id => rows.find(row => row.id === id));
	}
	async findById<K extends Keys<T> = never>(id: T['id'], other?: { select?: K[] }) {
		const row = await this.findByIdOrNull(id, other);
		if (row === undefined) throw new Exception('EntityNotFound', { collection: this.collectionName, id });
		return row;
	}
	async findByIdClient<K extends Keys<T> = never>(id: T['id'], other?: { select?: K[] }) {
		const row = await this.findByIdOrNull(id, other);
		if (row === undefined) throw new ClientException('EntityNotFound', { collection: this.collectionName, id });
		return row;
	}
	async findOne<K extends Keys<T> = never, CF extends string = never>(where: WhereOr<T>, other?: Other<T, K, CF>) {
		const row = await this.findOneOrNull(where, other);
		if (row === undefined) throw new Exception('EntityNotFound', { collection: this.collectionName, where });
		return row;
	}
	async findOneClient<K extends Keys<T> = never, CF extends string = never>(
		where: WhereOr<T>,
		other?: Other<T, K, CF>,
	) {
		const row = await this.findOneOrNull(where, other);
		if (row === undefined) throw new ClientException('EntityNotFound', { collection: this.collectionName, where });
		return row;
	}
	async findAll<K extends Keys<T> = never, CF extends string = ''>(where: WhereOr<T>, other: Other<T, K, CF> = {}) {
		return this.query<QueryResult<T, K, CF>>(
			sql`SELECT ${prepareFields(other.select, other.selectCustom)} FROM ${this.name}${prepareWhereOr(
				where,
			)}${prepareOther(other)}`,
		);
	}
	async findByIdOrNull<K extends Keys<T> = never>(id: T['id'], other: { select?: K[] } = {}) {
		try {
			if (BigInt(id) === 0n) return;
		} catch (e) {
			return;
		}
		if (other.select === undefined || other.select.length === 0) {
			return this.loader.load(id) as Promise<QueryResult<T, K, never> | undefined>;
		}
		return this.findOneOrNull({ id } as Where<T>, other);
	}
	async findOneOrNull<K extends Keys<T> = never, CF extends string = never>(
		where: WhereOr<T>,
		other: Other<T, K, CF> = {},
	) {
		other.limit = 1;
		const rows = await this.findAll(where, other);
		return rows.length > 0 ? rows[0] : undefined;
	}
	async update(id: T['id'], data: { [P in keyof T]?: T[P] | DBQuery | (T[P] extends number ? NumberUpdate : never) }) {
		const values: DBQuery[] = [];
		for (const key in data) {
			let val = data[key] as DBQuery;
			if (isIncrement(val)) val = sql`${dbField(key)} + ${val.increment}`;
			else if (isDecrement(val)) val = sql`${dbField(key)} - ${val.decrement}`;
			values.push(sql`${dbField(key)} = ${val}`);
		}
		const valueQuery = joinQueries(values, sql`, `);
		await this.query(sql`UPDATE ${this.name} SET ${valueQuery}${prepareWhereOr({ id: id })}`);
	}
	async remove(id: T['id']) {
		await this.query(sql`DELETE FROM ${this.name}${prepareWhereOr({ id: id })}`);
	}
	async create(
		data: { [P in keyof T]: T[P] | DBQuery | (P extends 'id' ? ('auto' | T[P]) : T[P]) },
		params: { noErrorIfConflict?: Keys<T> | DBQuery | true } = {},
	) {
		const keys: Keys<T>[] = [];
		const values: QueryValue[] = [];
		for (const key in data) {
			keys.push(key);
			let value = data[key];
			if (key === 'id' && value === 'auto') value = this.genId() as never;
			values.push(value);
		}
		const keyQuery = joinQueries(keys.map(key => sql`${dbField(key)}`), sql`, `);
		const valueQuery = joinQueries(values.map(val => sql`${val}`), sql`, `);
		let onConflictFields;
		if (params.noErrorIfConflict !== undefined) {
			if (params.noErrorIfConflict === true) {
				onConflictFields = sql``;
			}
			// eslint-disable-next-line
			else if (typeof params.noErrorIfConflict === 'string') {
				onConflictFields = sql`(${dbField(params.noErrorIfConflict)})`;
			} else {
				onConflictFields = sql`(${params.noErrorIfConflict})`;
			}
		}
		const onConflict = onConflictFields ? sql`ON CONFLICT ${onConflictFields} DO NOTHING` : sql``;
		await this.query(sql`INSERT INTO ${this.name} (${keyQuery}) VALUES (${valueQuery})${onConflict}`);
	}
	genId() {
		const b = randomBytes(8);
		const n =
			(BigInt(b[0] & 0b111_1111) << 56n) | // signed
			(BigInt(b[1]) << 48n) |
			(BigInt(b[2]) << 40n) |
			(BigInt(b[3]) << 32n) |
			(BigInt(b[4]) << 24n) |
			(BigInt(b[5]) << 16n) |
			(BigInt(b[6]) << 8n) |
			(BigInt(b[7]) << 0n);
		return n.toString() as T['id'];
	}
}

type NumberUpdate = { increment: number } | { decrement: number };

function isIncrement(val: unknown): val is { increment: number } {
	// eslint-disable-next-line
	return typeof val === 'object' && typeof (val as { increment: number }).increment === 'number';
}
function isDecrement(val: unknown): val is { decrement: number } {
	// eslint-disable-next-line
	return typeof val === 'object' && typeof (val as { decrement: number }).decrement === 'number';
}

function prepareFields(
	fields: ReadonlyArray<string | DBQuery> | undefined,
	customFields: { [key: string]: DBQuery } | undefined,
) {
	const arr = fields ? fields.map(f => sql`${typeof f === 'string' ? dbField(f) : f}`) : [];
	if (arr.length === 0) arr.push(sql`*`);
	if (customFields) {
		for (const f in customFields) {
			arr.push(sql`(${customFields[f]}) AS ${dbField(f)}`);
		}
	}
	return joinQueries(arr, sql`, `);
}

function prepareWhereOr(where: WhereOr<CollectionConstraint>) {
	if (Array.isArray(where)) {
		if (where.length > 0) {
			return sql` WHERE (${joinQueries(where.map(prepareWhere), sql`) OR (`)})`;
		}
		return sql``;
	}
	return Object.keys(where).length === 0 ? sql`` : sql` WHERE ${prepareWhere(where)}`;
}

function prepareWhere(where: Where<CollectionConstraint>) {
	const queries: DBQuery[] = [];
	for (const f in where) {
		if (where instanceof DBQuery) {
			queries.push(where);
			continue;
		}
		const fieldRaw = dbField(f);
		const operators = where[f] as AllOperators | string;
		if (typeof operators === 'object' && !Array.isArray(operators)) {
			for (const op in operators) {
				queries.push(handleOperator(fieldRaw, op as keyof AllOperators, operators as Required<AllOperators>));
			}
		} else {
			queries.push(sql`${fieldRaw} = ${operators}`);
		}
	}
	return joinQueries(queries, sql` AND `);
}

function handleOperator(field: DBRaw, op: keyof Required<AllOperators>, operators: Required<AllOperators>) {
	switch (op) {
		case 'between': {
			const val = operators.between;
			return sql`${field} BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'notBetween': {
			const val = operators.notBetween;
			return sql`${field} NOT BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'gt': {
			return sql`${field} > ${operators.gt}`;
		}
		case 'gte': {
			return sql`${field} >= ${operators.gte}`;
		}
		case 'lt': {
			return sql`${field} < ${operators.lt}`;
		}
		case 'lte': {
			return sql`${field} <= ${operators.lte}`;
		}
		case 'ne': {
			return sql`${field} <> ${operators.ne}`;
		}
		case 'in': {
			return sql`${field} = ANY (${operators.in})`;
		}
		case 'notIn': {
			return sql`${field} <> ANY (${operators.notIn})`;
		}
		case 'like': {
			return sql`${field} LIKE ${operators.like}`;
		}
		case 'notLike': {
			return sql`${field} NOT LIKE ${operators.notLike}`;
		}
		case 'iLike': {
			return sql`${field} ILIKE ${operators.iLike}`;
		}
		case 'notILike': {
			return sql`${field} NOT ILIKE ${operators.notILike}`;
		}
		case 'regexp': {
			return sql`${field} ~ ${operators.regexp}`;
		}
		case 'notRegexp': {
			return sql`${field} !~ ${operators.notRegexp}`;
		}
		case 'iRegexp': {
			return sql`${field} ~* ${operators.iRegexp}`;
		}
		case 'notIRegexp': {
			return sql`${field} !~* ${operators.notIRegexp}`;
		}
		case 'contained': {
			return sql`${field} <@ ${operators.contained}`;
		}
		case 'contains': {
			return sql`${field} @> ${operators.contains}`;
		}
		case 'overlap': {
			return sql`${field} && ${operators.overlap}`;
		}
		default:
			throw never(op);
	}
}

function prepareOther<T>(other: Other<T, Keys<T>, never> | undefined) {
	if (!other) return sql``;
	const queries: DBQuery[] = [];
	if (other.order) {
		if (other.order.asc) queries.push(sql` ORDER BY ${dbField(other.order.asc)} ASC`);
		else if (other.order.desc) queries.push(sql` ORDER BY ${dbField(other.order.desc)} DESC`);
	}
	if (other.limit !== undefined) queries.push(sql` LIMIT ${other.limit}`);
	if (other.offset !== undefined) queries.push(sql` OFFSET ${other.offset}`);
	return joinQueries(queries);
}

function dbQueryToString(dbQuery: DBQuery, allValues: QueryValue[]) {
	let queryStr = '';
	const { parts, values } = (dbQuery as unknown) as PublicDBQuery;
	for (let i = 0; i < parts.length; i++) {
		queryStr = queryStr + parts[i];
		if (values.length > i) {
			const value = values[i];
			if (value instanceof DBRaw) {
				queryStr = queryStr + value.raw;
			} else if (value instanceof DBQuery) {
				queryStr = queryStr + dbQueryToString(value, allValues);
			} else if (value instanceof DBQueries) {
				for (let j = 0; j < value.queries.length; j++) {
					const subQuery = value.queries[j];
					if (j > 0 && value.separator !== undefined) {
						queryStr = queryStr + dbQueryToString(value.separator, allValues);
					}
					queryStr = queryStr + dbQueryToString(subQuery, allValues);
				}
			} else {
				allValues.push(value);
				queryStr = queryStr + '$' + String(allValues.length);
			}
		}
	}
	return queryStr;
}

/* istanbul ignore next */
function never(value?: never): never {
	throw new Exception(`Never possible value`, { value });
}

function maybe<T>(val: T): T | undefined {
	return val;
}

function queryFactory(getClient: () => Promise<PoolClient>, release: boolean): QueryFun {
	return async <T>(query: DBQuery) => {
		const client = await getClient();
		const values: DBValue[] = [];
		const queryStr = dbQueryToString(query, values);
		let res;
		try {
			res = await client.query(queryStr, values);
			if (release) {
				client.release();
			}
		} catch (err) {
			throw new Exception('DB query error', { query: queryStr, values, message: (err as Error).message });
		}
		return res.rows as T[];
	};
}

type Pool = { connect: () => Promise<PoolClient> };
type PoolClient = {
	release: () => void;
	query: (q: string, values?: unknown[]) => Promise<{ rows: unknown[]; command: string }>;
};
type QueryFun = <T>(query: DBQuery) => Promise<T[]>;

export async function createDB<Schema extends SchemaConstraint>(pool: Pool) {
	const query = queryFactory(() => pool.connect(), true);
	const db = createProxy<Schema>(query);
	db.transaction = async (trx, rollback) => {
		const trxClient = await pool.connect();
		const query = queryFactory(async () => trxClient, false);
		try {
			const trxDB = createProxy<Schema>(query);
			await trxClient.query('BEGIN');
			await trx(trxDB);
			await trxClient.query('COMMIT');
		} catch (e) {
			await trxClient.query('ROLLBACK');
			if (rollback !== undefined) {
				await rollback();
			}
			throw e;
		} finally {
			trxClient.release();
		}
	};
	return db;
}

function createProxy<Schema extends SchemaConstraint>(query: QueryFun) {
	type CollectionType = Schema[keyof Schema];
	const db = { query, transaction: {} } as BaseDB<Schema>;
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = maybe(db[key]);
			if (collection === undefined) {
				const newCollection = new Collection<CollectionType>(key as string, query);
				db[key] = newCollection as BaseDB<Schema>[keyof Schema];
				return newCollection;
			}
			return collection;
		},
	});
}

type QueryValue = DBValue | DBRaw | DBQuery | DBQueries;

export class DBRaw {
	constructor(public readonly raw: string) {}
}

class DBQuery {
	constructor(
		//@ts-ignore
		private readonly parts: ReadonlyArray<string>,
		//@ts-ignore
		private readonly values: ReadonlyArray<QueryValue>,
	) {}
}

interface PublicDBQuery {
	parts: ReadonlyArray<string>;
	values: ReadonlyArray<QueryValue>;
}
class DBQueries {
	constructor(public readonly queries: ReadonlyArray<DBQuery>, public readonly separator: DBQuery | undefined) {}
}

export function dbField(field: string) {
	if (!/^[a-z_][a-z\d$_\-]+$/i.test(field))
		throw new Exception(`Field name contains unacceptable characters`, { field });
	return new DBRaw(`"${field}"`);
}

async function createMigrationTable(db: BaseDB<unknown>) {
	await db.query(sql`
	 CREATE TABLE IF NOT EXISTS migrations (
		id SERIAL PRIMARY KEY,
		name VARCHAR(255) NOT NULL UNIQUE,
		"runAt" TIMESTAMP NOT NULL 
	);
	`);
}

export interface Migration {
	up: string;
	name: string;
}

export async function readMigrationsFromDir(dir: string) {
	const files = await readdir(dir);
	files.sort();
	const migrations: Migration[] = [];
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const m = file.match(/^\d{4}-\d{2}-\d{2} \d{2}-\d{2} (.*?)\.sql$/);
		if (!m) throw new Exception(`Incorrect migration filename`, { file });
		const migrationName = m[1];
		if (migrations.find(m => m.name === migrationName))
			throw new Exception(`Migration already exists`, { migrationName });
		const up = await readFile(dir + '/' + file, 'utf8');
		migrations.push({ name: migrationName, up: up });
	}
	return migrations;
}

export async function migrateUp(db: BaseDB<unknown>, migrations: Migration[]) {
	await db.transaction(async trx => {
		await createMigrationTable(trx);
		const lastAppliedMigration = (await trx.query<{ name: string }>(
			sql`SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
		)).pop();
		if (migrations.length === 0) return;
		let newMigrations = migrations;
		if (lastAppliedMigration) {
			const idx = migrations.findIndex(m => m.name === lastAppliedMigration.name);
			if (idx === -1) throw new Exception(`name is not found in migrations`, { name: lastAppliedMigration.name });
			newMigrations = migrations.slice(idx + 1);
		}
		if (newMigrations.length > 0) {
			for (let i = 0; i < newMigrations.length; i++) {
				const migration = newMigrations[i];
				try {
					await trx.query(sql`${new DBRaw(migration.up)}`);
				} catch (_err) {
					const err = _err as Error;
					const json =
						err instanceof BaseException ? { ...err.json, migrationName: migration.name } : { message: err.message };
					throw new Exception('Migration error', json);
				}
			}
			await trx.query(
				sql`INSERT INTO migrations (name, "runAt") VALUES ${joinQueries(
					newMigrations.map(m => sql`(${m.name}, ${new Date()})`),
					sql`,`,
				)}`,
			);
			logger.info(`Applied new migrations`, { migrations: newMigrations.map(m => m.name) });
		}
	});
}
