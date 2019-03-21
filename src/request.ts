import request = require('request');

export function requestRaw(url: string, options?: request.CoreOptions) {
	return new Promise<{ res: request.Response; body: Buffer }>((resolve, reject) =>
		request(url, options, (err: Error | undefined, res, body) =>
			err
				? /* istanbul ignore next */
				  reject(err)
				: resolve({ res, body }),
		),
	);
}

export async function requestJSON<T>(url: string, options?: request.CoreOptions) {
	const { body } = await requestRaw(url, {
		headers: {
			'content-type': 'application/json',
		},
		...options,
	});
	try {
		return JSON.parse(body.toString()) as T;
	} catch (e) {
		throw new Error(`Response from "${url}" in not json: ${JSON.stringify(body.toString())}`);
	}
}
