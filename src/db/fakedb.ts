import DataLoader from 'dataloader';
import { NotFoundError } from '../errors';

async function fetchAllFrom<T>(name: string, ids: (number)[], map: Map<number, T>): Promise<(T)[]> {
	return ids.map(id => {
		const row = map.get(id);
		if (!row) throw new NotFoundError(`${name}:${id} is not found`);
		return row;
	});
}

export function createDBCollection<T>(name: string) {
	let ID = 1;
	const map = new Map<number, T>();
	const loader = new DataLoader<number, T>(ids => fetchAllFrom(name, ids, map), {
		cache: false,
	});
	return {
		async findById(id: number) {
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
		async create(data: T) {
			const id = ID++;
			(data as any).id = id;
			map.set((data as any).id, data);
			return id;
		},
		async update(id: number, data: Partial<T>) {
			const newData = { ...map.get(id)!, ...data };
			map.set(id, newData);
		},
		async remove(id: number) {
			return map.delete(id);
		},
	};
}
