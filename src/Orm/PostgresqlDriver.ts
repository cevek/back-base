import { randomBytes } from 'crypto';
import DataLoader from 'dataloader';
import {
	AllOperators,
	DBCollection,
	DBOptions,
	DBClient,
	DBEntityNotFound,
	DBQueries,
	DBQuery,
	DBRaw,
	joinDBQueries,
	Other,
	query,
	Where,
	WhereOr,
	ResultArr,
	Result,
	DBValue,
	Driver,
	TransactionType,
	DB,
} from './Base';

class Collection<T extends { id: string }> implements DBCollection<T> {
	private name: DBRaw;
	private loader: DataLoader<T['id'], T | undefined>;
	constructor(
		public collectionName: string,
		private query: <T>(dbQuery: DBQuery) => Promise<T>,
		prevCollection: Collection<T> | undefined,
	) {
		this.name = new DBRaw(collectionName);
		this.loader =
			(prevCollection && prevCollection.loader) ||
			new DataLoader(
				async ids => {
					const rows = await this.findAll({ id: { in: ids } } as Where<T>);
					const res = (ids.slice() as unknown[]) as (T | undefined)[];
					for (let i = 0; i < res.length; i++) {
						res[i] = rows.find(row => row.id === ids[i]);
					}
					return res;
				},
				{ cache: false },
			);
	}
	async findById<Keys extends keyof T>(id: T['id'], other?: { select?: Keys[] }) {
		const row = await this.findByIdOrNull(id, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(id));
		return row;
	}
	async findOne<Keys extends keyof T>(where: WhereOr<T>, other?: Other<T, Keys>) {
		const row = await this.findOneOrNull(where, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(where));
		return row;
	}
	async findAll<Keys extends keyof T>(where: WhereOr<T>, other: Other<T, Keys> = {}) {
		return this.query<ResultArr<T, Keys>>(
			query`SELECT ${prepareFields(other.select)} FROM ${this.name}${prepareWhereOr(where)}${prepareOther(other)}`,
		);
	}
	async findByIdOrNull<Keys extends keyof T>(id: T['id'], other: { select?: Keys[] } = {}) {
		if (other.select === undefined || other.select.length === 0) {
			return this.loader.load(id) as Promise<Result<T, Keys> | undefined>;
		}
		return this.findOneOrNull({ id } as Where<T>, other);
	}
	async findOneOrNull<Keys extends keyof T>(where: WhereOr<T>, other: Other<T, Keys> = {}) {
		other.limit = 1;
		const rows = await this.findAll(where, other);
		return rows.length > 0 ? (rows[0] as Result<T, Keys>) : undefined;
	}
	async update(id: T['id'], data: Partial<T>) {
		type Keys = keyof T;
		const values: DBQuery[] = [];
		for (const key in data) {
			values.push(query`${new DBRaw(key as string)} = ${(data[key] as unknown) as string}`);
		}
		const valueQuery = joinDBQueries(values, ', ');
		await this.query(query`UPDATE ${this.name} SET ${valueQuery}${prepareWhereOr({ id: id })}`);
	}
	async remove(id: T['id']) {
		await this.query(query`DELETE FROM ${this.name}${prepareWhereOr({ id: id })}`);
	}
	async create(data: Pick<T, Exclude<keyof T, 'id'>>) {
		type Keys = Exclude<keyof T, 'id'>;
		const keys: Keys[] = [];
		const values: unknown[] = [];
		for (const key in data) {
			keys.push(key as Keys);
			values.push(data[key as Keys]);
		}
		const keyQuery = joinDBQueries(keys.map(key => query`${new DBRaw(key as string)}`), ', ');
		const valueQuery = joinDBQueries(values.map(val => query`${val as string}`), ', ');
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
	return new DBRaw(fields !== undefined && fields.length > 0 ? fields.join(', ') : '*');
}

function prepareWhereOr(where: WhereOr<{ id: string }>) {
	if (Array.isArray(where)) {
		if (where.length > 0) {
			return query` WHERE (${joinDBQueries(where.map(prepareWhere), ') OR (')})`;
		}
		return query``;
	}
	return query` WHERE ${prepareWhere(where)}`;
}

function prepareWhere(where: Where<{ id: string }>) {
	const queries: DBQuery[] = [];
	for (const field in where) {
		const fieldRaw = new DBRaw(field);
		const operators = where[field as never] as AllOperators;
		if (operators instanceof Object && !Array.isArray(operators)) {
			for (const op in operators) {
				queries.push(handleOperator(fieldRaw, op as keyof AllOperators, operators as Required<AllOperators>));
			}
		} else {
			queries.push(query`${fieldRaw} = ${operators as string}`);
		}
	}
	return joinDBQueries(queries, ' AND ');
}

function handleOperator(field: DBRaw, op: keyof Required<AllOperators>, operators: Required<AllOperators>) {
	switch (op) {
		// case 'or': {
		// 	const val = ops[op];
		// 	return joinQueries(val.map(v => query`${field} = ${v}`), query` OR `);
		// }
		case 'between': {
			const val = operators.between;
			return query`${field} BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'notBetween': {
			const val = operators.notBetween;
			return query`${field} NOT BETWEEN ${val[0]} AND ${val[1]}`;
		}
		case 'eq': {
			return query`${field} = ${operators.eq}`;
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
			return query`${field} IN [${operators.in}]`;
		}
		case 'notIn': {
			return query`${field} NOT IN [${operators.notIn}]`;
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
		if (other.order.asc) queries.push(query` ORDER BY ${new DBRaw(String(other.order.asc))} ASC`);
		else if (other.order.desc) queries.push(query` ORDER BY ${new DBRaw(String(other.order.desc))} DESC`);
	}
	if (other.limit !== undefined) queries.push(query` LIMIT ${other.limit}`);
	if (other.offset !== undefined) queries.push(query` OFFSET ${other.offset}`);
	return joinDBQueries(queries);
}

function dbQueryToString(dbQuery: DBQuery, values: DBValue[]) {
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
						queryStr = queryStr + value.separator;
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
export function never(never?: never): never {
	throw new Error('Never possible');
}

function queryFactory(getClient: () => Promise<PoolClient>) {
	return async <T>(query: DBQuery) => {
		const client = await getClient();
		const values: DBValue[] = [];
		const queryStr = dbQueryToString(query, values);
		const res = await client.query(queryStr, values);
		return (res.rows as unknown) as T;
	};
}

type Pool = {
	connect: () => Promise<PoolClient>;
};
type PoolClient = { release: () => void; query: (q: string, values?: unknown[]) => Promise<{ rows: unknown }> };

export async function createDB<Schema>(pool: Pool) {
	type CollectionType = DB<Schema>[keyof Schema];
	const db = {} as DB<Schema>;
	db.transaction = async (trx, rollback) => {
		const trxClient = await pool.connect();
		try {
			const trxDB = await createTransaction<Schema>(proxyDB, pool);
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
	const query = queryFactory(() => pool.connect());
	db.query = query;
	const proxyDB = new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key] as CollectionType | undefined;
			if (collection === undefined) {
				const newCollection = new Collection(key as string, query, undefined);
				db[key] = (newCollection as unknown) as CollectionType;
				return newCollection;
			}
			return collection;
		},
	});
	return proxyDB;
}

async function createTransaction<Schema>(rootDB: DB<Schema>, pool: Pool) {
	type CollectionType = DB<Schema>[keyof Schema];
	const db = {} as DB<Schema>;
	const trxClient = await pool.connect();
	const query = queryFactory(async () => trxClient);
	db.query = query;
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key] as CollectionType | undefined;
			if (collection === undefined) {
				const prevCollection = (rootDB[key] as unknown) as Collection<{ id: string }>;
				const newCollection = new Collection(key as string, query, prevCollection);
				db[key] = (newCollection as unknown) as CollectionType;
				return newCollection;
			}
			return collection;
		},
	});
}

// const driver: Driver<unknown> = {
// 	CollectionClass: PostgresqlCollection,
// 	queryFactory: queryFactory,
// 	transactionFactory: transactionFactory,
// };
// export default driver;
