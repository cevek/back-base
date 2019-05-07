import request = require('request');
import { sleep, never } from './utils';
import { logger, ExternalException, Exception, BaseException } from './logger';

export interface RequestOptions extends request.CoreOptions {
	attemptsCount?: number;
	attemptDelay?: number;
}

type Response = {
	res?: request.Response;
	statusCode: number;
	body: Buffer | string | object;
};
type ResponseError = {
	statusCode: number;
	body: Buffer | string | object;
	error?: Error;
	url: string;
	options: object;
};

function requestAsync(url: string, options: RequestOptions = {}) {
	return new Promise<Response>((resolve, reject) =>
		request(url, options, (err: Error, res: request.Response | undefined, body: Buffer | undefined) => {
			const statusCode = res ? res.statusCode : 0;
			if (err)
				return reject(
					new Exception<ResponseError>('Request error', {
						statusCode,
						body: body || '',
						error: err,
						url,
						options,
					}),
				);
			return resolve({ res, statusCode, body: body || '' });
		}),
	);
}
async function _requestRaw(url: string, options: RequestOptions) {
	const { attemptsCount = 5, attemptDelay = 1000 } = options;
	for (let i = 1; i <= attemptsCount; i++) {
		logger.trace('Request', { url, options, attempt: i === 1 ? undefined : i });
		let res;
		try {
			res = await requestAsync(url, options);
		} catch (error) {
			if (error instanceof Exception) {
				const jsonErr = error.json as ResponseError;
				const timeoutError =
					jsonErr.error instanceof Error &&
					(jsonErr.error.message === 'ETIMEDOUT' || jsonErr.error.message === 'ESOCKETTIMEDOUT');
				if (timeoutError || error.json.statusCode >= 500) {
					if (i < attemptsCount) {
						await sleep(attemptDelay);
						continue;
					} else {
						throw new ExternalException<ResponseError>(timeoutError ? 'Request timeout' : '500', error.json);
					}
				}
			}
			throw error;
		}
		const errJson: ResponseError = { body: res.body, options, url, statusCode: res.statusCode };
		if (res.statusCode >= 500) throw new ExternalException<ResponseError>('500', errJson);
		if (res.statusCode >= 400) throw new Exception<ResponseError>('400', errJson);
		if (res.statusCode >= 200 && res.statusCode < 300) {
			return res;
		}
		throw new Exception<ResponseError>('Request error', errJson);
	}
	throw never();
}
export async function requestRaw(url: string, options: RequestOptions = {}) {
	const res = await _requestRaw(url, options);
	logger.trace('RequestResponse', { statusCode: res.statusCode, body: res.body });
	return res;
}

export async function requestJSON<T>(url: string, options?: RequestOptions): Promise<{ data: T } & Response> {
	let d;
	try {
		d = await _requestRaw(url, { headers: { 'content-type': 'application/json' }, ...options });
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
		let json;
		if (d.body instanceof Object) {
			json = (d.body as unknown) as T;
		} else {
			json = JSON.parse(d.body.toString() || '{}') as T;
		}
		logger.trace('RequestJSONResponse', { statusCode: d.statusCode, body: json });
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
