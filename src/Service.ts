import { Exception } from '.';

const map = new WeakMap<object, unknown>();

export class Service {
	addInstance<T>(instance: T) {
		map.set(((instance as unknown) as { constructor: new (...args: never[]) => T }).constructor, instance);
		return this;
	}
	add<T>(Class: new (...args: never[]) => T, instance: T) {
		map.set(Class, instance);
		return this;
	}
	get<T>(Class: new (...args: never[]) => T) {
		const instance = map.get(Class);
		if (instance === undefined) {
			throw new Exception(`Instance is not setted`, { name: Class.name });
		}
		return instance as T;
	}
}
export const service = new Service();
