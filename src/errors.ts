import { logger, ClientException } from '.';

export function handleError(error: Error) {
	logger.error(error);
	if (error instanceof ClientException) {
		return { error: error.name, status: 400 };
	}
	debugger;
	/* istanbul ignore next */
	return { error: 'SomethingWentWrong', status: 500 };
}
