import DataLoader from 'dataloader';
import { NotFoundError } from '../errors';

async function fetchAllFrom<T, ID>(name: string, ids: (ID)[], map: Map<ID, T>): Promise<(T)[]> {
	return ids.map(id => {
		const row = map.get(id);
		if (!row) throw new NotFoundError(`${name}:${id} is not found`);
		return row;
	});
}

export class DBCollection<T extends { id: any }> {
	map = new Map<T['id'], T>();
	static ID = 1;
	constructor(public collectionName: string) {}
	private loader = new DataLoader<T['id'], T>(ids => fetchAllFrom(this.collectionName, ids, this.map), {
		cache: false,
	});
	clear() {
		DBCollection.ID = 0;
		this.map.clear();
	}
	async findById(id: T['id']) {
		return this.loader.load(id);
	}
	async findBy(match: Partial<T>) {
		for (const row of this.map) {
			let found = true;
			for (const key in match) {
				const val = match[key];
				if (row[1][key] !== val) {
					found = false;
					break;
				}
			}
			if (found) return row[1];
		}
		throw new NotFoundError(`${this.collectionName}:${JSON.stringify(match)} is not found`);
	}
	async create(data: Pick<T, Exclude<keyof T, 'id'>>) {
		const id = String(DBCollection.ID++) as T['id'];
		const dd = data as T;
		dd.id = id;
		this.map.set((data as any).id, dd);
		return id as T['id'];
	}
	async update(id: T['id'], data: Partial<T>) {
		const newData = { ...this.map.get(id)!, ...data };
		this.map.set(id, newData);
	}
	async remove(id: T['id']) {
		return this.map.delete(id);
	}
}
