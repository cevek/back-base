import DataLoader from 'dataloader';
import { CollectionConstraint, DBCollection, DBEntityNotFound, Other, QueryResult, WhereOr, Keys } from './Base';

export type DB<Schema> = Collections<Schema> & { transaction: TransactionType<Schema> };
export type SchemaConstraint = { [key: string]: CollectionConstraint };

type TransactionType<Schema> = (
	trx: (db: Collections<Schema>) => Promise<void>,
	rollback?: () => Promise<void>,
) => Promise<void>;

type Collections<Schema> = {
	[P in keyof Schema]: Schema[P] extends CollectionConstraint ? Collection<Schema[P]> : never
};

class Collection<T extends CollectionConstraint> implements DBCollection<T> {
	private map: Map<T['id'], T>;
	private loader: DataLoader<T['id'], T | undefined>;
	constructor(public collectionName: string, public prevCollection: Collection<T> | undefined) {
		const prevLoader = prevCollection && prevCollection.loader;
		const prevMap = prevCollection && prevCollection.map;
		this.loader = prevLoader || new DataLoader(async ids => ids.map(id => this.map.get(id)), { cache: false });
		this.map = prevMap || new Map();
	}
	genId() {
		return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString() as T['id'];
	}
	async findById<K extends Keys<T>>(id: T['id'], other?: { select?: K[] }) {
		const row = await this.findByIdOrNull(id, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(id));
		return row;
	}
	async findOne<K extends Keys<T>>(where: WhereOr<T>, other?: Other<T, K>) {
		const row = await this.findOneOrNull(where, other);
		if (row === undefined) throw new DBEntityNotFound(this.collectionName, JSON.stringify(where));
		return row;
	}
	async findAll<K extends Keys<T>>(where: WhereOr<T>, other: Other<T, K> = {}) {
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
		return rows as QueryResult<T, K>[];
	}

	async findByIdOrNull<K extends Keys<T>>(id: T['id'], other?: { select?: K[] }) {
		return this.loader.load(id) as Promise<QueryResult<T, K> | undefined>;
	}
	async findOneOrNull<K extends Keys<T>>(where: WhereOr<T>, other: Other<T, K> = {}) {
		other.limit = 1;
		const rows = await this.findAll(where, other);
		return rows.length > 0 ? rows[0] : undefined;
	}

	async update(id: T['id'], data: Partial<T>) {
		const item = await this.findById(id) as T;
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

export async function createDB<Schema extends SchemaConstraint>() {
	const db = createProxy<Schema>(undefined);
	db.transaction = async (trx, rollback) => {
		try {
			const trxDB = createProxy<Schema>(db);
			return await trx(trxDB);
		} catch (e) {
			if (rollback !== undefined) {
				await rollback();
			}
			throw e;
		}
	};
	return db;
}

function createProxy<Schema extends SchemaConstraint>(rootDB: DB<Schema> | undefined) {
	const db = {} as DB<Schema>;
	type CollectionType = Schema[keyof Schema];
	return new Proxy(db, {
		get(_, key: keyof Schema) {
			const collection = maybe(db[key]);
			if (collection === undefined) {
				const prevCollection = rootDB === undefined ? undefined : (rootDB[key] as Collection<CollectionType>);
				const newCollection = new Collection<CollectionType>(key as string, prevCollection);
				db[key] = newCollection as DB<Schema>[keyof Schema];
				return newCollection;
			}
			return collection;
		},
	});
}

function maybe<T>(val: T): T | undefined {
	return val;
}
