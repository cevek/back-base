import Express from 'express';
export type Middleware = (
	req: Express.Request,
	res: Express.Response,
	next: (err?: Error) => void,
) => void | object | Promise<void | object>;
export type Route = {
	[key: string]: Route | Middleware | Middleware[];
};
export function makeRoutes(
	express: Express.Express,
	map: Route,
	method: 'get' | 'put' | 'post' | 'patch' | 'delete' | 'all',
	path: string,
	parentBeforeEach: Middleware[],
) {
	let beforeEach = parentBeforeEach.slice();
	for (const route in map) {
		const value = map[route];
		if (route === 'beforeEach') {
			if (Array.isArray(value)) {
				beforeEach.push(...value.map(transformMiddleware));
			} else {
				beforeEach.push(transformMiddleware(value as Middleware));
			}
			continue;
		}
		if (route === 'get' || route === 'put' || route === 'post' || route === 'patch' || route === 'delete' || route === 'all') {
			makeRoutes(express, value as Route, route, path, beforeEach);
			continue;
		}
		if (Array.isArray(value)) {
			express[method](path, ...beforeEach, ...value.map(transformMiddleware));
		} else if (typeof value === 'function') {
			express[method](path, ...beforeEach, transformMiddleware(value));
		} else if (typeof value === 'object' && value !== null) {
			makeRoutes(express, value, method, path === '/' ? '/' : path + '/' + route, beforeEach);
		} else {
			throw new Error(`Unexpected router value`);
		}
	}
}

let activeThreadsCount = 0;
export function getActiveThreadsCount() {
	return activeThreadsCount;
}
function transformMiddleware(middleware: Middleware) {
	if (typeof middleware !== 'function') {
		throw new Error('Middleware is not a function');
	}
	return (request: Express.Request, response: Express.Response, next: (err?: Error) => void) => {
		let nextCalled = false;
		let nextArg: Error | undefined;
		try {
			activeThreadsCount++;
			const result = middleware(request, response, arg => {
				nextArg = arg;
				nextCalled = true;
			});
			if (result instanceof Promise) {
				return result.then(
					obj => {
						activeThreadsCount--;
						if (nextCalled) {
							nextArg === undefined ? next() : next(nextArg);
						} else {
							if (!response.headersSent) {
								response.send({ status: 'ok', data: obj });
							}
						}
					},
					err => {
						activeThreadsCount--;
						return next(err);
					},
				);
			}
		} catch (err) {
			activeThreadsCount--;
			next(err);
		}
	};
}
