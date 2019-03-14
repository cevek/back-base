import request = require('request');

export class TestSession {
	private jar = request.jar();
	constructor(public port: number) {}
	async query<T>(query: string, error = '', result?: {}): Promise<T> {
		const res = await this.req<{data: T, errors: {}[]}>('/api/graphql', { query });
		const errorMsg = res.errors && res.errors[0];
		/* istanbul ignore next */
		if (error) {
			if (!errorMsg) throw new Error(`Should be error: "${error}", got nothing, query: ${query}`);
			if (error !== errorMsg)
				throw new Error(
					`Should be error: "${error}", got: ${JSON.stringify(errorMsg)}, query: ${query}`,
				);
		} else {
			/* istanbul ignore next */
			if (errorMsg)
				throw new Error(`Unexpected error: ${JSON.stringify(errorMsg)}, query: ${query}`);
		}
		/* istanbul ignore next */
		if (result && JSON.stringify(result) !== JSON.stringify(res.data)) {
			const got = JSON.stringify(res.data);
			const expect = JSON.stringify(result);
			throw new Error(`Result is not the same: \n${expect}\ngot:\n${got}\nquery: ${query}`);
        }
        return res.data;
	}
	private req<T>(url: string, json: {}) {
		return new Promise<T>((resolve, reject) =>
			request.post(
				`http://localhost:${this.port}${url}`,
				{ jar: this.jar, json },
				(err:{}, res, body: T) =>
					err
						? /* istanbul ignore next */
						  reject(err)
						: resolve(body),
			),
		);
	}
}