import { randomBytes } from 'crypto';
import {
	AllOperators,
	DBCollection,
	DBCollections,
	createDB,
	DBOptions,
	DBClient,
	DBEntityNotFound,
	DBQueries,
	DBQuery,
	DBRaw,
	joinQueries,
	Other,
	query,
	Where,
	WhereOr,
	ResultArr,
	Result,
} from './Base';

export class PostgresqlCollection<T extends { id: string }> implements DBCollection<T> {
	private name: DBRaw;
	constructor(public collectionName: string, private client: DBClient) {
		this.name = new DBRaw(collectionName);
	}
	async query<T>(query: DBQuery) {
		const q = queryToString(query);
		return this.client.query<T>(q.query, q.values);
	}
	async findById<Keys extends keyof T>(fields: Keys[], id: T['id']) {
		return this.findOne(fields, { id } as Where<T>);
	}
	async findOne<Keys extends keyof T>(fields: Keys[], where: WhereOr<T>, other?: Other<T>) {
		const row = await this.findOneOrNull(fields, where, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(where));
		return row;
	}
	async findAll<Keys extends keyof T>(fields: Keys[], where: WhereOr<T>, other?: Other<T>) {
		return this.query<ResultArr<T, Keys>>(
			query`SELECT ${prepareFields(fields)} FROM ${this.name}${prepareWhereOr(where)}${prepareOther(other)}`,
		);
	}
	async findByIdOrNull<Keys extends keyof T>(fields: Keys[], id: T['id']) {
		return this.findOneOrNull(fields, { id } as Where<T>);
	}
	async findOneOrNull<Keys extends keyof T>(fields: Keys[], where: WhereOr<T>, other: Other<T> = {}) {
		other.limit = 1;
		const rows = await this.findAll(fields, where, other);
		return rows.length > 0 ? (rows[0] as Result<T, Keys>) : undefined;
	}
	async update(id: T['id'], data: Partial<T>) {
		type Keys = keyof T;
		const values: DBQuery[] = [];
		for (const key in data) {
			values.push(query`${new DBRaw(key as string)} = ${(data[key] as unknown) as string}`);
		}
		const valueQuery = joinQueries(values, ', ');
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
		const keyQuery = joinQueries(keys.map(key => query`${new DBRaw(key as string)}`), ', ');
		const valueQuery = joinQueries(values.map(val => query`${val as string}`), ', ');
		await this.query(query`INSERT INTO ${this.name} (${keyQuery}) VALUES (${valueQuery})`);
	}
	genId() {
		const b = randomBytes(8);
		const n =
			(BigInt(b[0]) << 56n) |
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

export async function postgresqlRunTransaction<T, Schema>(
	options: DBOptions<Schema>,
	trx: (trxDB: DBCollections<Schema>) => Promise<T>,
): Promise<T> {
	const trxClient = await options.getClient();
	try {
		options.client = trxClient;
		const trxDB = await createDB<Schema>(options);
		await trxClient.query('BEGIN');
		const ret = await trx(trxDB);
		await trxClient.query('COMMIT');
		return ret;
	} catch (e) {
		await trxClient.query('ROLLBACK');
		throw e;
	} finally {
		trxClient.release();
	}
}

function prepareFields(fields: (string | number | symbol)[]) {
	return new DBRaw(fields.length > 0 ? fields.join(', ') : '*');
}

function prepareWhereOr(where: WhereOr<{ id: string }>) {
	if (Array.isArray(where)) {
		if (where.length > 0) {
			return query` WHERE (${joinQueries(where.map(prepareWhere), ') OR (')})`;
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
	return joinQueries(queries, ' AND ');
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

function prepareOther<T>(other: Other<T> | undefined) {
	if (!other) return query``;
	const queries: DBQuery[] = [];
	if (other.order) {
		if (other.order.asc) queries.push(query` ORDER BY ${new DBRaw(String(other.order.asc))} ASC`);
		else if (other.order.desc) queries.push(query` ORDER BY ${new DBRaw(String(other.order.desc))} DESC`);
	}
	if (other.limit !== undefined) queries.push(query` LIMIT ${other.limit}`);
	if (other.offset !== undefined) queries.push(query` OFFSET ${other.offset}`);
	return joinQueries(queries);
}

function queryToString(dbQuery: DBQuery, idx = 1) {
	let queryStr = '';
	const values: unknown[] = [];
	function subQuery(value: DBQuery) {
		const q = queryToString(value, idx);
		idx = q.idx;
		values.push(...q.values);
		return q.query;
	}
	for (let i = 0; i < dbQuery.parts.length; i++) {
		queryStr += dbQuery.parts[i];
		if (dbQuery.values.length > i) {
			const value = dbQuery.values[i];
			if (value instanceof DBRaw) {
				queryStr += value.raw;
			} else if (value instanceof DBQuery) {
				queryStr += subQuery(value);
			} else if (value instanceof DBQueries) {
				for (let j = 0; j < value.queries.length; j++) {
					const qq = value.queries[j];
					if (j > 0 && value.separator !== undefined) {
						queryStr += value.separator;
					}
					queryStr += subQuery(qq);
				}
			} else {
				queryStr += '$' + String(idx++);
				values.push(value);
			}
		}
	}
	return { query: queryStr, values, idx };
}

/* istanbul ignore next */
export function never(never?: never): never {
	throw new Error('Never possible');
}
