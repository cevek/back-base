import { ClientException, Exception } from './logger';

type NumberContraints = { min?: number; max?: number };
type StringContraints = { minLen?: number; maxLen?: number; regexp?: RegExp };
type ArrayContraints = { minSize?: number; maxSize?: number };
type DateContraints = { min?: Date | undefined; max?: Date | undefined };

type NullableMethods<T> = {
	[P in Exclude<keyof T, 'nullable'>]: T[P] extends (value: infer Value, constraints: infer Constraints) => infer Return
		? (value: Value | undefined, constraints: Constraints) => Return | undefined
		: never
};

class NullableAssert implements NullableMethods<Assert> {
	signedFloat(value: number | undefined, constraints?: NumberContraints) {
		return value === undefined ? undefined : this.assert.signedFloat(value, constraints);
	}
	uFloat(value: number | undefined, constraints?: NumberContraints) {
		return value === undefined ? undefined : this.assert.uFloat(value, constraints);
	}
	signedInt(value: number | undefined, constraints?: NumberContraints) {
		return value === undefined ? undefined : this.assert.signedInt(value, constraints);
	}
	uInt(value: number | undefined, constraints?: NumberContraints) {
		return value === undefined ? undefined : this.assert.uInt(value, constraints);
	}
	string(value: string | undefined, constraints?: StringContraints) {
		return value === undefined ? undefined : this.assert.string(value, constraints);
	}
	noEmptyString(value: string | undefined, constraints?: StringContraints) {
		return value === undefined ? undefined : this.assert.noEmptyString(value, constraints);
	}
	date(value: Date | undefined, constraints?: DateContraints) {
		return value === undefined ? undefined : this.assert.date(value, constraints);
	}
	array<T>(value: readonly T[] | undefined, constraints?: ArrayContraints) {
		return value === undefined ? undefined : this.assert.array(value, constraints);
	}
	noEmptyArray<T>(value: readonly T[] | undefined, constraints?: ArrayContraints) {
		return value === undefined ? undefined : this.assert.noEmptyArray(value, constraints);
	}
	bool(value: boolean | undefined) {
		return value === undefined ? undefined : this.assert.bool(value);
	}
	email(value: string | undefined) {
		return value === undefined ? undefined : this.assert.email(value);
	}
	object<T extends object>(value: T | undefined) {
		return value === undefined ? undefined : this.assert.object(value);
	}
	noEmptyObject<T extends object>(value: T | undefined) {
		return value === undefined ? undefined : this.assert.noEmptyObject(value);
	}
	union<T extends U, U>(value: T | undefined, union: readonly U[]) {
		return value === undefined ? undefined : this.assert.union(value, union);
	}
	enum(value: string | number | undefined, Enum: { [key: number]: string }) {
		return value === undefined ? undefined : this.assert.enum(value, Enum);
	}
	constructor(protected assert: Assert) {}
}

export class Assert {
	constructor(protected ErrorFactory: typeof ClientException) {}

	nullable = new NullableAssert(this);

	protected error(name: string, json: object) {
		throw new this.ErrorFactory(name, json);
	}

	protected validateNumber(value: number, constraints: NumberContraints | undefined) {
		if (typeof value !== 'number') this.error('Value is not a number', { value });
		if (Number.isNaN(value)) this.error('Value is NaN', { value });
		if (!Number.isFinite(value)) this.error('Value is not finite', { value });
		if (constraints !== undefined) {
			this.between(value, constraints.min, constraints.max, 'Value');
		}
	}

	protected between(value: number, min: number | undefined, max: number | undefined, error: string) {
		if (min !== undefined && min > value) this.error(error + ' should be >= ', { min, value });
		if (max !== undefined && max < value) this.error(error + ' should be <= ', { max, value });
	}

	protected validateUnsigned(value: number) {
		if (value < 0) this.error('Value should be 0 or positive', { value });
	}

	protected validateInt(value: number) {
		if (value !== Math.ceil(value)) this.error('Value should be integer', { value });
	}

	signedFloat(value: number, constraints?: NumberContraints) {
		this.validateNumber(value, constraints);
		return value;
	}

	uFloat(value: number, constraints?: NumberContraints) {
		this.signedFloat(value, constraints);
		this.validateUnsigned(value);
		return value;
	}
	signedInt(value: number, constraints?: NumberContraints) {
		this.validateNumber(value, constraints);
		this.validateInt(value);
		return value;
	}
	uInt(value: number, constraints?: NumberContraints) {
		this.signedInt(value, constraints);
		this.validateUnsigned(value);
		return value;
	}
	string(value: string, constraints?: StringContraints) {
		if (typeof value !== 'string') this.error('Value is not a string', { value });
		if (constraints !== undefined) {
			this.between(value.length, constraints.minLen, constraints.maxLen, 'String length');
			if (constraints.regexp !== undefined && constraints.regexp.test(value)) {
				this.error('String is not valueidated by regexp ', { regexp: constraints.regexp.toString(), value });
			}
		}
		return value;
	}
	noEmptyString(value: string, constraints?: StringContraints) {
		this.string(value, constraints);
		if (value === '') this.error('String should not be empty', { value });
		return value;
	}
	date(value: Date, constraints?: DateContraints) {
		if (!(value instanceof Date)) this.error('Value is not a date', { value });
		if (Number.isNaN(value.getTime())) this.error('Date is invalueid', { value });
		if (constraints !== undefined) {
			this.between(
				value.getTime(),
				constraints.min !== undefined ? constraints.min.getTime() : undefined,
				constraints.max !== undefined ? constraints.max.getTime() : undefined,
				'Date',
			);
		}
		return value;
	}
	array<T>(value: readonly T[], constraints?: { minSize?: number; maxSize?: number }) {
		if (!Array.isArray(value)) this.error('Value is not an array', { value });
		if (constraints !== undefined) this.between(value.length, constraints.minSize, constraints.maxSize, 'Array.length');
		return value;
	}
	noEmptyArray<T>(value: readonly T[], constraints?: { minSize?: number; maxSize?: number }) {
		this.array(value, constraints);
		if (value.length === 0) this.error('Array should have elements', { value });
		return value;
	}
	bool(value: boolean) {
		if (typeof value !== 'boolean') this.error('Value is not a boolean', { value });
		return value;
	}
	email(value: string) {
		this.string(value);
		if (!/^\S+@\S+$/.test(value)) this.error('Value is an incorrect email', { value });
		return value;
	}
	object<T extends object>(value: T) {
		if (typeof value !== 'object' || value === null) this.error('Value is not an object', { value });
		return value;
	}
	noEmptyObject<T extends object>(value: T) {
		this.object(value);
		if (Object.keys(value).length === 0) this.error('Object should have elements', { value });
		return value;
	}
	union<T extends U, U>(value: T, union: readonly U[]): T {
		if (!union.includes(value)) this.error(`Union doesn't have specified element`, { value });
		return value;
	}
	enum(value: number | string, Enum: { [key: number]: string }) {
		if (Enum[value as number] === undefined) this.error(`Enum doesn't have specified element`, { value });
		return value;
	}
}

export const assert = new Assert(Exception);
export const clientValidation = new Assert(ClientException);
