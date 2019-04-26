import request = require('request');
import { requestJSON } from './request';

export class TestSession {
	private jar = request.jar();
	constructor(public port: number) {}
	async query<T>(query: string, error = '', result?: {}): Promise<T> {
		const res = await this.request<{ data: T; errors: {}[] }>('post', '/api/graphql', { query });
		const errorMsg = res.data.errors && res.data.errors[0];
		/* istanbul ignore next */
		if (error) {
			if (!errorMsg) throw new Error(`Should be error: "${error}", got nothing, query: ${query}`);
			if (error !== errorMsg)
				throw new Error(`Should be error: "${error}", got: ${JSON.stringify(errorMsg)}, query: ${query}`);
		} else {
			/* istanbul ignore next */
			if (errorMsg) throw new Error(`Unexpected error: ${JSON.stringify(errorMsg)}, query: ${query}`);
		}
		/* istanbul ignore next */
		if (result && JSON.stringify(result) !== JSON.stringify(res.data)) {
			const got = JSON.stringify(res.data);
			const expect = JSON.stringify(result);
			throw new Error(`Result is not the same: \n${expect}\ngot:\n${got}\nquery: ${query}`);
		}
		return res.data.data;
	}
	request<T>(method: string, url: string, json?: {}) {
		return requestJSON<T>(`http://localhost:${this.port}${url}`, { method, jar: this.jar, json });
	}
}


