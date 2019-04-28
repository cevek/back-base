import { logger } from './logger';

type Thread = {};

let currentThread: Thread | undefined = undefined;
export async function thread(fn: () => Promise<void>) {
	currentThread = {} as Thread;
	await fn();
	currentThread = undefined;
}
export function getCurrentThread() {
	if (currentThread === undefined) throw new Error('CurrentThread is undefined');
	return currentThread;
}
export function threadPause<T>(val: T) {
	currentThread = undefined;
	return val;
}
export function threadContinue<T>(thread: Thread, val: T) {
	currentThread = thread;
	return val;
}
export function setDataToCurrentThread(key: symbol, val: unknown) {
	const thread = getCurrentThread();
	thread[key as never] = val as never;
}
export function getDataFromCurrentThread<T>(key: symbol) {
	const thread = getCurrentThread();
	return thread[key as never] as T | undefined;
}

const callSymbol = Symbol('Call');

function getParentId() {
	const parentId = getDataFromCurrentThread<string>(callSymbol);
	return parentId;
}

function enter(name: string) {
	const parentId = getParentId();
	const currentId = logger.trace('call', { name, timestamp: Date.now() });
	setDataToCurrentThread(callSymbol, currentId);
	return parentId;
}

function exit<T>(parentId: string | undefined, val?: T) {
	setDataToCurrentThread(callSymbol, parentId);
	return val;
}
async function foo(_x: number) {
	const parentId = enter('foo');
	1 + 2;
	if (Math) {
		throw 1;
	}
	exit(parentId);
}

async function x() {
	const thread = getCurrentThread();
	const parentId = enter('x');
	try {
		const y = threadContinue(thread, await threadPause(foo(1)));
		return exit(parentId, y);
	} catch (e) {}
	return exit(parentId, 123);
}
thread(async () => {
	await x();
});
