export type TypedJson<T> = {
   parse(data: unknown): T;
   serialize(data: T): unknown;
   nullable(): TypedJson<T | null>;
   array(): TypedJson<T[]>;
};

type Fields = Record<string, TypedJson<unknown>>;

type Parsed<T> = {
   [K in keyof T]: T[K] extends TypedJson<infer U> ? U : never;
};

type Literal = string | number | boolean;

function isRecord(data: unknown): data is Record<string, unknown> {
   return typeof data === "object" && data !== null && !Array.isArray(data);
}

function invalid(expected: string, data: unknown): never {
   let received: string | undefined;
   try {
      received = JSON.stringify(data);
   } catch {
      received = typeof data === "bigint" ? `${data}n` : "[unserializable value]";
   }
   throw new TypeError(`Expected ${expected}, got ${received}`);
}

class PathError extends TypeError {
   constructor(readonly path: readonly (string | number)[], cause: unknown) {
      const location = path
         .map((key, index) => {
            if (typeof key === "number") return `[${key}]`;
            return /^[A-Za-z_$][\w$]*$/.test(key)
               ? `${index === 0 ? "" : "."}${key}`
               : `[${JSON.stringify(key)}]`;
         })
         .join("");
      const message = cause instanceof Error ? cause.message : String(cause);

      super(`${location}: ${message}`, { cause });
   }
}

function at<T>(key: string | number, operation: () => T): T {
   try {
      return operation();
   } catch (error) {
      throw error instanceof PathError
         ? new PathError([key, ...error.path], error.cause)
         : new PathError([key], error);
   }
}

function createTypedJson<T>(
   item: Pick<TypedJson<T>, "parse" | "serialize">,
): TypedJson<T> {
   return {
      ...item,
      nullable() {
         return createTypedJson<T | null>({
            parse(data) {
               return data === null || data === undefined
                  ? null
                  : item.parse(data);
            },
            serialize(data?: T | null) {
               return data === null || data === undefined
                  ? null
                  : item.serialize(data);
            },
         });
      },
      array() {
         return createTypedJson<T[]>({
            parse(data) {
               if (!Array.isArray(data)) {
                  return invalid("array", data);
               }

               return data.map((value, index) =>
                  at(index, () => item.parse(value)),
               );
            },
            serialize(data) {
               return data.map((value, index) =>
                  at(index, () => item.serialize(value)),
               );
            },
         });
      },
   };
}

const nonFiniteNumberStrings = new Set(["NaN", "Infinity", "-Infinity"]);

const base64Pattern =
   /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const j = {
   custom: createTypedJson,

   object<T extends Fields>(fields: T): TypedJson<Parsed<T>> {
      return createTypedJson({
         parse(data) {
            if (!isRecord(data)) {
               return invalid("object", data);
            }

            const parsed = Object.fromEntries(
               Object.entries(fields).map(([key, field]) => [
                  key,
                  at(key, () => field.parse(data[key])),
               ]),
            );

            return parsed as Parsed<T>;
         },
         serialize(data) {
            const values: Record<string, unknown> = data;

            return Object.fromEntries(
               Object.entries(fields).map(([key, field]) => [
                  key,
                  at(key, () => field.serialize(values[key])),
               ]),
            );
         },
      });
   },

   string(): TypedJson<string> {
      return createTypedJson({
         parse(data) {
            return typeof data === "string" ? data : invalid("string", data);
         },
         serialize(data) {
            return data;
         },
      });
   },

   number(): TypedJson<number> {
      return createTypedJson({
         parse(data) {
            if (typeof data === "number") {
               return data;
            }

            return typeof data === "string" && nonFiniteNumberStrings.has(data)
               ? Number(data)
               : invalid("number", data);
         },
         serialize(data) {
            return Number.isFinite(data) ? data : String(data);
         },
      });
   },

   boolean(): TypedJson<boolean> {
      return createTypedJson({
         parse(data) {
            return typeof data === "boolean" ? data : invalid("boolean", data);
         },
         serialize(data) {
            return data;
         },
      });
   },

   bigint(): TypedJson<bigint> {
      return createTypedJson({
         parse(data) {
            return typeof data === "string" && /^-?\d+$/.test(data)
               ? BigInt(data)
               : invalid("bigint string", data);
         },
         serialize(data) {
            return data.toString();
         },
      });
   },

   date(): TypedJson<Date> {
      return createTypedJson({
         parse(data) {
            if (typeof data !== "string") {
               return invalid("date string", data);
            }

            const date = new Date(data);

            return Number.isNaN(date.getTime())
               ? invalid("date string", data)
               : date;
         },
         serialize(data) {
            return data.toISOString();
         },
      });
   },

   tuple<T extends TypedJson<unknown>[]>(...items: T): TypedJson<Parsed<T>> {
      return createTypedJson({
         parse(data) {
            if (!Array.isArray(data) || data.length !== items.length) {
               return invalid(`tuple of ${items.length}`, data);
            }

            const parsed = items.map((item, index) =>
               at(index, () => item.parse(data[index])),
            );

            return parsed as Parsed<T>;
         },
         serialize(data) {
            const values: readonly unknown[] = data;

            return items.map((item, index) =>
               at(index, () => item.serialize(values[index])),
            );
         },
      });
   },

   record<T>(item: TypedJson<T>): TypedJson<Record<string, T>> {
      return createTypedJson({
         parse(data) {
            if (!isRecord(data)) {
               return invalid("record", data);
            }

            return Object.fromEntries(
               Object.entries(data).map(([key, value]): [string, T] => [
                  key,
                  at(key, () => item.parse(value)),
               ]),
            );
         },
         serialize(data) {
            return Object.fromEntries(
               Object.entries(data).map(([key, value]) => [
                  key,
                  at(key, () => item.serialize(value)),
               ]),
            );
         },
      });
   },

   literal<const T extends readonly [Literal, ...Literal[]]>(
      ...values: T
   ): TypedJson<T[number]> {
      return createTypedJson({
         parse(data) {
            const match = values.find((value) => value === data);

            if (match === undefined) {
               const expected = values
                  .map((value) => JSON.stringify(value))
                  .join(" | ");

               return invalid(expected, data);
            }

            return match;
         },
         serialize(data) {
            return data;
         },
      });
   },

   bytes(): TypedJson<Uint8Array> {
      return createTypedJson({
         parse(data) {
            return typeof data === "string" && base64Pattern.test(data)
               ? new Uint8Array(Buffer.from(data, "base64"))
               : invalid("base64 string", data);
         },
         serialize(data) {
            return Buffer.from(data).toString("base64");
         },
      });
   },
};
