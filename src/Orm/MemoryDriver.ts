import DataLoader from 'dataloader';
import {
	DBCollection,
	WhereOr,
	Other,
	DBClient,
	DBEntityNotFound,
	Result,
	ResultArr,
	Driver,
	DBQuery,
	DBOptions,
	DBCollections,
	createDB,
	TransactionType,
} from './Base';

export class MemoryCollection<T extends { id: string }> implements DBCollection<T> {
	private map = new Map<T['id'], T>();
	private loader = new DataLoader<T['id'], T | undefined>(async ids => ids.map(id => this.map.get(id)), {
		cache: false,
	});
	constructor(public collectionName: string, private client: DBClient) {}
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
		// for (const row of this.map) {
		// 	let found = true;
		// 	for (const key in match) {
		// 		const val = match[key];
		// 		if (row[1][key] !== val) {
		// 			found = false;
		// 			break;
		// 		}
		// 	}
		// 	if (found) return row[1];
		// }
		return ([] as unknown) as ResultArr<T, Keys>;
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

function queryFactory(client: DBClient) {
	return <T>(query: DBQuery) => {
		throw new Error("Memory driver doesn't support queries");
	};
}

function transactionFactory<Schema>(options: DBOptions<Schema>): TransactionType<Schema> {
	return async (trx, rollback) => {
		const trxClient = await options.getClient();
		try {
			options.client = trxClient;
			const trxDB = await createDB<Schema>(options);
			const ret = await trx(trxDB);
			return ret;
		} catch (e) {
			if (rollback !== undefined) {
				await rollback();
			}
			throw e;
		}
	};
}
const driver: Driver<unknown> = {
	CollectionClass: MemoryCollection,
	queryFactory: queryFactory,
	transactionFactory: transactionFactory,
};
export default driver;
