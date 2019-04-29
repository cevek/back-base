import { createVerify } from 'crypto';
import { Exception } from './logger';

export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

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
export function never(value?: never): never {
	throw new Exception(`Never possible value`, { value });
}

export function sleep(ms: number) {
	return new Promise(res => setTimeout(res, ms));
}

export function verifySignature(data: string, signatureBase64: string, publicKey: string) {
	const verifier = createVerify('SHA256');
	verifier.update(data);
	return verifier.verify(publicKey, signatureBase64, 'base64');
}

export function normalToWebSafeBase64(normalBase64: string) {
	return normalBase64
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function webSafeToNormalBase64(safeBase64: string) {
	return safeBase64.replace(/\-/g, '+').replace(/_/g, '/') + '=='.substring(0, (3 * safeBase64.length) % 4);
}

export function getEnv(name: string) {
	const val = process.env[name];
	if (val === undefined) throw new Exception(`Env variable should be specified`, { name });
	return val;
}
export function getEnvNullable(name: string) {
	return process.env[name];
}

export function nonNull<T>(value: T | undefined): T {
	if (value === undefined) throw new Exception('Value cannot be undefined', { value });
	return value;
}


