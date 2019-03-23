const map = new WeakMap<object, object>();
export function injectable<T extends object>(target: T) {
	return new Proxy(target, {
		get(_, key: never) {
			const instance = map.get(target);
			const obj = instance === undefined ? target : instance;
			return obj[key];
		},
		construct(_, args: unknown[]) {
			const instance = map.get(target);
			const obj = instance === undefined ? target : instance;
			return new (obj as new (...args: unknown[]) => object)(...args);
		},
	});
}

export function mock<T extends object>(replace: T, to: T & {}) {
	map.set(replace, to);
}

const serviceMap = new WeakMap<object, unknown>();
export function service<T>(Class: new (...args: never[]) => T): T {
	const instance = serviceMap.get(Class);
	if (instance === undefined) {
		throw new Error(`Instance of ${Class.name} is not setted`);
	}
	return instance as T;
}
export function setService<T>(Class: new (...args: never[]) => T, instance: T) {
	serviceMap.set(Class, instance);
}
