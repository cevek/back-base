import DataLoader from 'dataloader';
import { NotFoundError } from '../errors';

async function fetchAllFrom<T, ID>(name: string, ids: (ID)[], map: Map<ID, T>): Promise<(T)[]> {
	return ids.map(id => {
		const row = map.get(id);
		if (!row) throw new NotFoundError(`${name}:${id} is not found`);
		return row;
	});
}

export function createDBCollection<T extends { id: any }>(name: string) {
	type ID = T['id'];
	let ID = 1;
	const map = new Map<ID, T>();
	const loader = new DataLoader<ID, T>(ids => fetchAllFrom(name, ids, map), {
		cache: false,
	});
	return {
		async findById(id: ID) {
			return loader.load(id);
		},
		async findBy(match: Partial<T>) {
			for (const row of map) {
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
			throw new NotFoundError(`${name}:${JSON.stringify(match)} is not found`);
		},
		async create(data: Pick<T, Exclude<keyof T, 'id'>>) {
			const id = String(ID++) as ID;
			const dd = data as T;
			dd.id = id;
			map.set((data as any).id, dd);
			return id as ID;
		},
		async update(id: ID, data: Partial<T>) {
			const newData = { ...map.get(id)!, ...data };
			map.set(id, newData);
		},
		async remove(id: ID) {
			return map.delete(id);
		},
	};
}
