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

export function sleep(ms: number) {
	return new Promise(res => setTimeout(res, ms));
}

export function assert(val: boolean, msg = 'Assertaion failed') {
	if (!val) throw new Error(msg);
}
export function nonNull<T>(val: T | undefined, msg = 'value cannot be undefined'): T {
	if (val === undefined) throw new Error(msg);
	return val;
}
