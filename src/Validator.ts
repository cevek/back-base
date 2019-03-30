import { BaseClientError } from './errors';
class ValidationError extends BaseClientError<unknown> {
	constructor(error: string, val: unknown) {
		super('ValidationError', error + ': ' + JSON.stringify(val));
	}
}

type NumberContraints = { min?: number; max?: number };
type StringContraints = { minLen?: number; maxLen?: number; regexp?: RegExp };
function validateNumber(val: number, constraints: NumberContraints | undefined) {
	if (typeof val !== 'number') throw new ValidationError('Value is not a number', val);
	if (Number.isNaN(val)) throw new ValidationError('Value is NaN', val);
	if (!Number.isFinite(val)) throw new ValidationError('Value is not finite', val);
	if (constraints !== undefined) {
		between(val, constraints.min, constraints.max, 'Value');
	}
}

function between(val: number, min: number | undefined, max: number | undefined, error: string) {
	if (min !== undefined && min > val) throw new ValidationError(error + ' should be >= ' + min, val);
	if (max !== undefined && max < val) throw new ValidationError(error + ' should be <= ' + max, val);
}

function validateUnsigned(val: number) {
	if (val < 0) throw new ValidationError('Value should be positive', val);
}

function validateInt(val: number) {
	if (val !== Math.ceil(val)) throw new ValidationError('Value should be integer', val);
}

export function assertSignedFloat(val: number, constraints?: NumberContraints) {
	validateNumber(val, constraints);
	return val;
}
export function assertSignedFloatNullable(val: number | undefined, constraints?: NumberContraints) {
	if (val !== undefined) assertSignedFloat(val, constraints);
	return val;
}
export function assertPositiveFloat(val: number, constraints?: NumberContraints) {
	validateNumber(val, constraints);
	validateUnsigned(val);
	return val;
}
export function assertPositiveFloatNullable(val: number | undefined, constraints?: NumberContraints) {
	if (val !== undefined) assertPositiveFloat(val, constraints);
	return val;
}
export function assertSignedInt(val: number, constraints?: NumberContraints) {
	validateNumber(val, constraints);
	validateInt(val);
	return val;
}
export function assertPositiveIntNullable(val: number | undefined, constraints?: NumberContraints) {
	if (val !== undefined) assertSignedInt(val, constraints);
	return val;
}
export function assertPositiveInt(val: number, constraints?: NumberContraints) {
	validateNumber(val, constraints);
	validateInt(val);
	validateUnsigned(val);
	return val;
}
export function assertSignedIntNullable(val: number | undefined, constraints?: NumberContraints) {
	if (val !== undefined) assertPositiveInt(val, constraints);
	return val;
}
export function assertString(val: string, constraints?: StringContraints) {
	if (typeof val !== 'string') throw new ValidationError('Value is not a string', val);
	if (constraints !== undefined) {
		between(val.length, constraints.minLen, constraints.maxLen, 'String length');
		if (constraints.regexp !== undefined && constraints.regexp.test(val)) {
			throw new ValidationError('String is not validated by regexp ' + constraints.regexp, val);
		}
	}
	return val;
}
export function assertStringNullable(val: string | undefined, constraints?: StringContraints) {
	if (val !== undefined) assertString(val, constraints);
	return val;
}
export function assertNoEmptyString(val: string, constraints?: StringContraints) {
	assertString(val, constraints);
	if (val === '') throw new ValidationError('String should not be empty', val);
	return val;
}
export function assertNoEmptyStringNullable(val: string | undefined, constraints?: StringContraints) {
	if (val !== undefined) assertNoEmptyString(val, constraints);
	return val;
}
export function assertDate(val: Date, constraints?: { min?: Date; max?: Date }) {
	if (!(val instanceof Date)) throw new ValidationError('Value is not a date', val);
	if (Number.isNaN(val.getTime())) throw new ValidationError('Date is invalid', val);
	if (constraints !== undefined) {
		between(
			val.getTime(),
			constraints.min !== undefined ? constraints.min.getTime() : undefined,
			constraints.max !== undefined ? constraints.max.getTime() : undefined,
			'Date',
		);
	}
	return val;
}
export function assertDateNullable(val: Date | undefined, constraints?: { min?: Date; max?: Date }) {
	if (val !== undefined) assertDate(val, constraints);
	return val;
}
export function assertArray(val: unknown[], constraints?: { minSize?: number; maxSize?: number }) {
	if (!Array.isArray(val)) throw new ValidationError('Value is not an array', val);
	if (constraints !== undefined) between(val.length, constraints.minSize, constraints.maxSize, 'Array.length');
	return val;
}
export function assertArrayNullable(val: unknown[] | undefined, constraints?: { min?: Date; max?: Date }) {
	if (val !== undefined) assertArray(val);
	return val;
}
export function assertNoEmptyArray(val: unknown[], constraints?: { minSize?: number; maxSize?: number }) {
	assertArray(val);
	if (val.length === 0) throw new ValidationError('Array should have elements', val);
	return val;
}
export function assertNoEmptyArrayNullable(val: unknown[] | undefined, constraints?: { min?: Date; max?: Date }) {
	if (val !== undefined) assertNoEmptyArray(val);
	return val;
}
export function assertBool(val: boolean) {
	if (typeof val !== 'boolean') throw new ValidationError('Value is not a boolean', val);
	return val;
}
export function assertBoolNullable(val: boolean | undefined) {
	if (val !== undefined) assertBool(val);
	return val;
}
export function assertEmail(val: string) {
	assertString(val);
	if (!/^\S+@\S+$/.test(val)) throw new ValidationError('Value is an incorrect email', val);
	return val;
}
export function emailNullable(val: string | undefined) {
	if (val !== undefined) assertEmail(val);
	return val;
}
export function assertObject(val: object) {
	if (typeof val !== 'object' || val === null) throw new ValidationError('Value is not an object', val);
	return val;
}
export function assertObjectNullable(val: object | undefined) {
	if (val !== undefined) assertObject(val);
	return val;
}
