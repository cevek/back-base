import request = require('request');
import { sleep, never } from './utils';
import { logger, ExternalException, Exception, BaseException } from './logger';

export interface RequestOptions extends request.CoreOptions {
	attemptsCount?: number;
	attemptDelay?: number;
}

type Response = {
	res: request.Response;
	statusCode: number;
	body: Buffer | string | object;
	error: Error | string | undefined;
};

function requestAsync(url: string, options: RequestOptions = {}) {
	return new Promise<Response>((resolve, reject) =>
		request(url, options, (err: Error | string | undefined, res, body: Buffer | undefined) => {
			const data = { res, statusCode: res.statusCode, body: body || '', error: err };
			if (err) return reject(new Exception('Request error', data));
			return resolve(data);
		}),
	);
}
export async function requestRaw(url: string, options: RequestOptions = {}) {
	const { attemptsCount = 5, attemptDelay = 1000 } = options;
	for (let i = 1; i <= attemptsCount; i++) {
		logger.trace('Request start', { url, options, attempt: i === 1 ? undefined : i });
		const res = await requestAsync(url, options);
		const timeoutError =
			res.error instanceof Error && (res.error.message === 'ETIMEDOUT' || res.error.message === 'ESOCKETTIMEDOUT');
		if (timeoutError || res.statusCode >= 500) {
			if (i < attemptsCount) {
				await sleep(attemptDelay);
			} else {
				throw new ExternalException(timeoutError ? 'Request timeout' : '500', res);
			}
		}
		if (res.statusCode >= 400) throw new Exception('400', res);
		if (res.statusCode >= 200 && res.statusCode < 300) {
			logger.trace('Request response', res);
			return res;
		}
		throw new Exception('Request error', res);
	}
	throw never();
}

export async function requestJSON<T>(url: string, options?: RequestOptions): Promise<{ data: T } & Response> {
	let d;
	try {
		d = await requestRaw(url, { headers: { 'content-type': 'application/json' }, ...options });
	} catch (e) {
		if (e instanceof BaseException) {
			const err = e.json as Response;
			if (typeof err.body === 'string') {
				try {
					err.body = JSON.parse(err.body);
				} catch (e) {}
			}
		}
		throw e;
	}
	try {
		const json = JSON.parse(d.body.toString() || '{}') as T;
		return { ...d, data: json };
	} catch {
		throw new Exception(`Response is not json`, d);
	}
}

export function mockJsonRequest(_method: string, _url: string, _json: object | undefined, _result: object) {}
export function mockGetJsonRequest(url: string, result: object) {
	return mockJsonRequest('get', url, undefined, result);
}
export function mockPostJsonRequest(url: string, json: object | undefined, result: object) {
	return mockJsonRequest('post', url, json, result);
}
