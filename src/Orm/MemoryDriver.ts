import DataLoader from 'dataloader';
import { DB, DBCollection, DBEntityNotFound, Other, Result, ResultArr, WhereOr } from './Base';

class Collection<T extends { id: string }> implements DBCollection<T> {
	private map: Map<T['id'], T>;
	private loader: DataLoader<T['id'], T | undefined>;
	constructor(public collectionName: string, public prevCollection: Collection<T> | undefined) {
		this.loader =
			(prevCollection && prevCollection.loader) ||
			new DataLoader(async ids => ids.map(id => this.map.get(id)), { cache: false });
		this.map = (prevCollection && prevCollection.map) || new Map();
	}
	genId() {
		return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
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
		function compare(row: T, whereOr: WhereOr<T>): boolean {
			if (Array.isArray(whereOr)) return whereOr.some(where => compare(row, where));
			for (const key in whereOr) {
				const val = whereOr[key];
				const rowVal = row[key];
				if (val instanceof Object && !Array.isArray(val)) {
					throw new Error(`Comparators doesn't support`);
				} else if (rowVal !== val) {
					return false;
				}
			}
			return true;
		}
		const rows: T[] = [];
		for (const row of this.map) {
			if (compare(row[1], where)) {
				rows.push(row[1]);
			}
		}
		return (rows as unknown) as ResultArr<T, Keys>;
	}

	async findByIdOrNull<Keys extends keyof T>(id: T['id'], other?: { select?: Keys[] }) {
		return this.loader.load(id) as Promise<Result<T, Keys> | undefined>;
	}
	async findOneOrNull<Keys extends keyof T>(where: WhereOr<T>, other: Other<T, Keys> = {}) {
		other.limit = 1;
		const rows = await this.findAll(where, other);
		return rows.length > 0 ? (rows[0] as Result<T, Keys>) : undefined;
	}

	async update(id: T['id'], data: Partial<T>) {
		const item = await this.findById(id);
		const newData = { ...item, ...data };
		this.map.set(id, newData);
	}
	async remove(id: T['id']) {
		this.map.delete(id);
	}
	async create(data: T) {
		this.map.set(data.id, data);
	}
}

export async function createDB<Schema>() {
	type CollectionType = DB<Schema>[keyof Schema];
	const db = {} as DB<Schema>;
	db.transaction = async (trx, rollback) => {
		try {
			const trxDB = await createTransaction<Schema>(proxyDB);
			return await trx(trxDB);
		} catch (e) {
			if (rollback !== undefined) {
				await rollback();
			}
			throw e;
		}
	};
	db.query = () => {
		throw new Error('query method is not supported');
	};
	const proxyDB = new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key] as CollectionType | undefined;
			if (collection === undefined) {
				const newCollection = new Collection(key as string, undefined);
				db[key] = (newCollection as unknown) as CollectionType;
				return newCollection;
			}
			return collection;
		},
	});
	return proxyDB
}

async function createTransaction<Schema>(rootDB: DB<Schema>) {
	type CollectionType = DB<Schema>[keyof Schema];
	const db = {} as DB<Schema>;
	db.query = rootDB.query;
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = db[key] as CollectionType | undefined;
			if (collection === undefined) {
				const prevCollection = (rootDB[key] as unknown) as Collection<{ id: string }>;
				const newCollection = new Collection(key as string, prevCollection);
				db[key] = (newCollection as unknown) as CollectionType;
				return newCollection;
			}
			return collection;
		},
	});
}
