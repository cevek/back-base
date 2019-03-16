import { randomBytes } from 'crypto';
import DataLoader from 'dataloader';
import {
	AllOperators,
	CollectionConstraint,
	DBCollection,
	DBEntityNotFound,
	DBValue,
	Other,
	QueryResult,
	Where,
	WhereOr,
	DBQueryError,
} from './Base';
import { readdir, readFile } from 'fs-extra';

export type DB<Schema> = Collections<Schema> & {
	transaction: TransactionFun<Schema>;
	query: QueryFun;
};
export type TransactionDB<Schema> = Collections<Schema> & { query: QueryFun };
export type SchemaConstraint = { [key: string]: CollectionConstraint };
export type Column = DBRaw;

type TransactionFun<Schema> = (
	trx: (db: TransactionDB<Schema>) => Promise<void>,
	rollback?: () => Promise<void>,
) => Promise<void>;

type Collections<Schema> = {
	[P in keyof Schema]: Schema[P] extends CollectionConstraint ? Collection<Schema[P]> : never
};

export function query(strs: TemplateStringsArray, ...inserts: QueryValue[]) {
	return new DBQuery(strs, inserts);
}
export function joinQueries(queries: DBQuery[], separator?: DBQuery): DBQuery {
	return query`${new DBQueries(queries, separator)}`;
}

class Collection<T extends CollectionConstraint> implements DBCollection<T> {
	private loader: DataLoader<T['id'], T | undefined>;
	name: Column;
	fields: { [P in keyof T]: Column };
	constructor(
		public collectionName: string,
		private query: <T>(dbQuery: DBQuery) => Promise<T>,
		prevCollection: Collection<T> | undefined,
	) {
		this.name = field(collectionName);
		this.fields = new Proxy({} as this['fields'], {
			get: (_, key: string) => new DBRaw(`"${collectionName}"."${key}"`),
		});
		const prevLoader = prevCollection && prevCollection.loader;
		this.loader = prevLoader || new DataLoader(async ids => this.loadById(ids), { cache: false });
	}
	private async loadById(ids: T['id'][]) {
		const rows = await this.findAll({ id: { in: ids } } as Where<T>);
		const res = (ids.slice() as unknown[]) as (T | undefined)[];
		for (let i = 0; i < res.length; i++) {
			res[i] = rows.find(row => row.id === ids[i]);
		}
		return res;
	}
	async findById<Keys extends keyof T = never>(id: T['id'], other?: { select?: Keys[] }) {
		const row = await this.findByIdOrNull(id, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(id));
		return row;
	}
	async findOne<Keys extends keyof T = never>(where: WhereOr<T>, other?: Other<T, Keys>) {
		const row = await this.findOneOrNull(where, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(where));
		return row;
	}
	async findAll<Keys extends keyof T = never>(where: WhereOr<T>, other: Other<T, Keys> = {}) {
		return this.query<QueryResult<T, Keys>[]>(
			query`SELECT ${prepareFields(other.select)} FROM ${this.name}${prepareWhereOr(where)}${prepareOther(other)}`,
		);
	}
	async findByIdOrNull<Keys extends keyof T = never>(id: T['id'], other: { select?: Keys[] } = {}) {
		try {
			if (BigInt(id) === 0n) return;
		} catch (e) {
			return;
		}
		if (other.select === undefined || other.select.length === 0) {
			return this.loader.load(id) as Promise<QueryResult<T, Keys> | undefined>;
		}
		return this.findOneOrNull({ id } as Where<T>, other);
	}
	async findOneOrNull<Keys extends keyof T = never>(where: WhereOr<T>, other: Other<T, Keys> = {}) {
		other.limit = 1;
		const rows = await this.findAll(where, other);
		return rows.length > 0 ? rows[0] : undefined;
	}
	async update(id: T['id'], data: Partial<T>) {
		type Keys = keyof T;
		const values: DBQuery[] = [];
		for (const key in data) {
			values.push(query`${field(key)} = ${(data[key] as unknown) as string}`);
		}
		const valueQuery = joinQueries(values, query`, `);
		await this.query(query`UPDATE ${this.name} SET ${valueQuery}${prepareWhereOr({ id: id })}`);
	}
	async remove(id: T['id']) {
		await this.query(query`DELETE FROM ${this.name}${prepareWhereOr({ id: id })}`);
	}
	async create(data: T) {
		const keys: (keyof T)[] = [];
		const values: QueryValue[] = [];
		for (const key in data) {
			keys.push(key);
			values.push(data[key]);
		}
		const keyQuery = joinQueries(keys.map(key => query`${field(key)}`), query`, `);
		const valueQuery = joinQueries(values.map(val => query`${val}`), query`, `);
		await this.query(query`INSERT INTO ${this.name} (${keyQuery}) VALUES (${valueQuery})`);
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

function prepareFields(fields: ReadonlyArray<string | number | symbol> | undefined) {
	return new DBRaw(fields !== undefined && fields.length > 0 ? `"${fields.join('", "')}"` : '*');
}

function prepareWhereOr(where: WhereOr<CollectionConstraint>) {
	if (Array.isArray(where)) {
		if (where.length > 0) {
			return query` WHERE (${joinQueries(where.map(prepareWhere), query`) OR (`)})`;
		}
		return query``;
	}
	return Object.keys(where).length === 0 ? query`` : query` WHERE ${prepareWhere(where)}`;
}

function prepareWhere(where: Where<CollectionConstraint>) {
	const queries: DBQuery[] = [];
	for (const f in where) {
		const fieldRaw = field(f);
		const operators = where[f] as AllOperators | string;
		if (typeof operators === 'object' && operators !== null && !Array.isArray(operators)) {
			for (const op in operators) {
				queries.push(handleOperator(fieldRaw, op as keyof AllOperators, operators as Required<AllOperators>));
			}
		} else {
			queries.push(query`${fieldRaw} = ${operators}`);
		}
	}
	return joinQueries(queries, query` AND `);
}

function handleOperator(field: DBRaw, op: keyof Required<AllOperators>, operators: Required<AllOperators>) {
	switch (op) {
		case 'between': {
			const val = operators.between;
			return query`${field} BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'notBetween': {
			const val = operators.notBetween;
			return query`${field} NOT BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'gt': {
			return query`${field} > ${operators.gt}`;
		}
		case 'gte': {
			return query`${field} >= ${operators.gte}`;
		}
		case 'lt': {
			return query`${field} < ${operators.lt}`;
		}
		case 'lte': {
			return query`${field} <= ${operators.lte}`;
		}
		case 'ne': {
			return query`${field} <> ${operators.ne}`;
		}
		case 'in': {
			return query`${field} = ANY (${operators.in})`;
		}
		case 'notIn': {
			return query`${field} <> ANY (${operators.notIn})`;
		}
		case 'like': {
			return query`${field} LIKE ${operators.like}`;
		}
		case 'notLike': {
			return query`${field} NOT LIKE ${operators.notLike}`;
		}
		case 'iLike': {
			return query`${field} ILIKE ${operators.iLike}`;
		}
		case 'notILike': {
			return query`${field} NOT ILIKE ${operators.notILike}`;
		}
		case 'regexp': {
			return query`${field} ~ ${operators.regexp}`;
		}
		case 'notRegexp': {
			return query`${field} !~ ${operators.notRegexp}`;
		}
		case 'iRegexp': {
			return query`${field} ~* ${operators.iRegexp}`;
		}
		case 'notIRegexp': {
			return query`${field} !~* ${operators.notIRegexp}`;
		}
		case 'contained': {
			return query`${field} <@ ${operators.contained}`;
		}
		case 'contains': {
			return query`${field} @> ${operators.contains}`;
		}
		case 'overlap': {
			return query`${field} && ${operators.overlap}`;
		}
		default:
			throw never(op);
	}
}

function prepareOther<T>(other: Other<T, keyof T> | undefined) {
	if (!other) return query``;
	const queries: DBQuery[] = [];
	if (other.order) {
		if (other.order.asc) queries.push(query` ORDER BY ${field(other.order.asc)} ASC`);
		else if (other.order.desc) queries.push(query` ORDER BY ${field(other.order.desc)} DESC`);
	}
	if (other.limit !== undefined) queries.push(query` LIMIT ${other.limit}`);
	if (other.offset !== undefined) queries.push(query` OFFSET ${other.offset}`);
	return joinQueries(queries);
}

function dbQueryToString(dbQuery: DBQuery, values: QueryValue[]) {
	let queryStr = '';
	for (let i = 0; i < dbQuery.parts.length; i++) {
		queryStr = queryStr + dbQuery.parts[i];
		if (dbQuery.values.length > i) {
			const value = dbQuery.values[i];
			if (value instanceof DBRaw) {
				queryStr = queryStr + value.raw;
			} else if (value instanceof DBQuery) {
				queryStr = queryStr + dbQueryToString(value, values);
			} else if (value instanceof DBQueries) {
				for (let j = 0; j < value.queries.length; j++) {
					const subQuery = value.queries[j];
					if (j > 0 && value.separator !== undefined) {
						queryStr = queryStr + dbQueryToString(value.separator, values);
					}
					queryStr = queryStr + dbQueryToString(subQuery, values);
				}
			} else {
				values.push(value);
				queryStr = queryStr + '$' + String(values.length);
			}
		}
	}
	return queryStr;
}

/* istanbul ignore next */
function never(never?: never): never {
	throw new Error('Never possible');
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
			throw new DBQueryError(queryStr, values, err.message);
		}
		return (res.rows as unknown) as T;
	};
}

type Pool = { connect: () => Promise<PoolClient> };
type PoolClient = {
	release: () => void;
	query: (q: string, values?: unknown[]) => Promise<{ rows: unknown; command: string }>;
};
type QueryFun = <T>(query: DBQuery) => Promise<T>;

export async function createDB<Schema extends SchemaConstraint>(pool: Pool) {
	const query = queryFactory(() => pool.connect(), true);
	const db = createProxy<Schema>(undefined, query);
	db.transaction = async (trx, rollback) => {
		const trxClient = await pool.connect();
		const query = queryFactory(async () => trxClient, false);
		try {
			const trxDB = createProxy<Schema>(db, query);
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

function createProxy<Schema extends SchemaConstraint>(rootDB: DB<Schema> | undefined, query: QueryFun) {
	type CollectionType = Schema[keyof Schema];
	const db = { query, transaction: {} } as DB<Schema>;
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key];
			if (collection === undefined) {
				const prevCollection = rootDB === undefined ? undefined : (rootDB[key] as Collection<CollectionType>);
				const newCollection = new Collection<CollectionType>(key as string, query, prevCollection);
				db[key] = newCollection as DB<Schema>[keyof Schema];
				return newCollection;
			}
			return collection;
		},
	});
}

type QueryValue = DBValue | DBRaw | DBQuery | DBQueries;

class DBRaw {
	constructor(public readonly raw: string) {}
}
class DBQuery {
	constructor(public readonly parts: ReadonlyArray<string>, public readonly values: ReadonlyArray<QueryValue>) {}
}
class DBQueries {
	constructor(public readonly queries: ReadonlyArray<DBQuery>, public readonly separator: DBQuery | undefined) {}
}

function field(field: string | number | symbol) {
	return new DBRaw(`"${field as string}"`);
}

async function createMigrationTable(db: TransactionDB<unknown>) {
	await db.query(query`
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
		if (!m) throw new Error(`Incorrect migration filename: ${file}`);
		const migrationName = m[1];
		if (migrations.find(m => m.name === migrationName)) throw new Error(`Migration with name "${migrationName}" already exists`);
		const up = await readFile(dir + '/' + file, 'utf8');
		migrations.push({ name: migrationName, up: up });
	}
	return migrations;
}

export async function migrateUp(
	db: DB<unknown>,
	migrations: Migration[],
	logger: { info: (...args: unknown[]) => void },
) {
	await db.transaction(async trx => {
		await createMigrationTable(trx);
		const lastAppliedMigration = (await trx.query<{ name: string }[]>(
			query`SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
		)).pop();
		if (migrations.length === 0) return;
		let newMigrations = migrations;
		if (lastAppliedMigration) {
			const idx = migrations.findIndex(m => m.name === lastAppliedMigration.name);
			if (idx === -1) throw new Error(`${lastAppliedMigration.name} is not found in migrations`);
			newMigrations = migrations.slice(idx + 1);
		}
		if (newMigrations.length > 0) {
			for (let i = 0; i < newMigrations.length; i++) {
				const migration = newMigrations[i];
				try {
					await trx.query(query`${new DBRaw(migration.up)}`);
				} catch (err) {
					if (err instanceof DBQueryError) {
						throw new DBQueryError(err.query, err.values, migration.name + ': ' + err.error);
					}
					throw err;
				}
			}
			await trx.query(
				query`INSERT INTO migrations (name, "runAt") VALUES ${joinQueries(
					newMigrations.map(m => query`(${m.name}, ${new Date()})`),
					query`,`,
				)}`,
			);
			logger.info(`Apply new migrations: ${newMigrations.map(m => m.name).join(', ')}`);
		}
	});
}
