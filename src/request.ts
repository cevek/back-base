import request = require('request');

export function requestRaw(url: string, options?: request.CoreOptions) {
	return new Promise<{ res: request.Response; body: Buffer }>((resolve, reject) =>
		request(url, options, (err: Error | undefined, res, body: Buffer | undefined) => {
			if (err) return reject(err);
			if (res.statusCode < 200 || res.statusCode >= 400)
				return reject(`Request "${url}", status code: ${res.statusCode}, body: ${body}`);
			if (!body) return reject(`Request "${url}", response body is empty`);
			resolve({ res, body });
		}),
	);
}

export async function requestJSON<T>(url: string, options?: request.CoreOptions) {
	const { res, body } = await requestRaw(url, {
		headers: {
			'content-type': 'application/json',
		},
		...options,
	});
	try {
		const json = JSON.parse(body.toString()) as T;
		return { data: json, res };
	} catch (e) {
		throw new Error(`Response from "${url}" in not json: ${JSON.stringify(body.toString())}`);
	}
}
