import request = require('request');

export class TestSession {
	private jar = request.jar();
	async query(query: string, error = '', result?: {}) {
		const res = await this.req('/api/graphql', { query });
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
	}
	init() {
		return this.req('/api/clear-fake-db', {});
	}
	private req(url: string, json: {}) {
		return new Promise<any>((resolve, reject) =>
			request.post('http://localhost:4000' + url, { jar: this.jar, json }, (err, res, body) =>
				err
					? /* istanbul ignore next */
					  reject(err)
					: resolve(body),
			),
		);
	}
}
