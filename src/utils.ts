import { DBUser } from './db/db.schema';

export interface Context {
	session: {
		user: DBUser | undefined;
	};
}
export interface ContextWithUser {
	session: {
		user: DBUser;
		destroy(cb: (err: {}) => void): void;
	};
}

/* istanbul ignore next */
export function lastItem<T>(arr: ReadonlyArray<T>): T {
	return arr.length === 0 ? undefined! : arr[arr.length - 1];
}

export function removeItem<Arr extends ReadonlyArray<T>, T>(arr: Arr, item: T): Arr {
	const pos = arr.indexOf(item);
	/* istanbul ignore next */
	if (pos === -1) {
		return arr;
	}
	return (arr.slice(0, pos).concat(arr.slice(pos + 1)) as unknown) as Arr;
}

export function removeItemOrNever<Arr extends ReadonlyArray<T>, T>(arr: Arr, item: T): Arr {
	const res = removeItem(arr, item);
	/* istanbul ignore next */
	if (res === arr) {
		return never();
	}
	return res;
}

/* istanbul ignore next */
export function never(never?: never): never {
	throw new Error('Never possible');
}
