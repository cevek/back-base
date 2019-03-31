import request = require('request');
import { logger, JsonError } from './logger';
import { sleep, never } from './utils';

export interface RequestOptions extends request.CoreOptions {
	attemptsCount?: number;
	attemptDelay?: number;
}
export async function requestRaw(url: string, options: RequestOptions = {}) {
	logger.trace({ url, options }, 'Request start');
	const { attemptsCount = 1, attemptDelay = 1000 } = options;
	for (let i = 0; i < attemptsCount; i++) {
		try {
			return await new Promise<{ res: request.Response; body: Buffer | string | object }>((resolve, reject) =>
				request(url, options, (err: Error | string | undefined, res, body: Buffer | undefined) => {
					logger.trace({ url, body }, 'Request response');
					if (err) return reject(err);
					if (res.statusCode < 200 || res.statusCode >= 400)
						return reject(new JsonError('Request reject', { url, statusCode: res.statusCode, body }));
					resolve({ res, body: body || '' });
				}),
			);
		} catch (e) {
			if (i < attemptsCount - 1) {
				logger.trace(`Request error ${url}: ${e.message}`);
				await sleep(attemptDelay);
			} else {
				Error.captureStackTrace(e);
				throw e;
			}
		}
	}
	throw never();
}

export async function requestJSON<T>(
	url: string,
	options?: RequestOptions,
): Promise<{ data: T; res: request.Response }> {
	let res;
	let body;
	try {
		const d = await requestRaw(url, {
			headers: {
				'content-type': 'application/json',
			},
			...options,
		});
		res = d.res;
		body = d.body;
	} catch (e) {
		let err: Error = e;
		if (typeof err === 'string') {
			try {
				err = JSON.parse(err);
			} catch (e) {}
		}
		throw err;
	}
	if (typeof body === 'object' && body !== null && !(body instanceof Buffer)) {
		return { data: (body as unknown) as T, res };
	}
	try {
		const json = JSON.parse(body.toString() || '{}') as T;
		return { data: json, res };
	} catch {
		throw new JsonError(`Response in not json`, { url, body });
	}
}
