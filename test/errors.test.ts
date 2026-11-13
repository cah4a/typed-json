import { describe, expect, test } from "vitest";
import { j } from "../src/index.js";

describe("error paths", () => {
   test("combines object, array, tuple, record, and nullable paths", () => {
      const schema = j.object({
         items: j.tuple(j.string(), j.record(j.number().nullable())).array(),
      });

      expect(() => schema.parse({ items: [["ok", {}], ["bad", { price: "x" }]] }))
         .toThrow('items[1][1].price: Expected number, got "x"');
   });

   test.each(["a.b", "0", "", 'a["b"]', "a\nb"])(
      "quotes the record key %j unambiguously",
      (key) => {
         const schema = j.object({ values: j.record(j.number()) });
         expect(() => schema.parse({ values: { [key]: "x" } }))
            .toThrow(`values[${JSON.stringify(key)}]: Expected number, got "x"`);
      },
   );

   test("identifies root array indices and nested object fields", () => {
      const schema = j.object({ price: j.number() }).array();
      expect(() => schema.parse([{ price: "x" }]))
         .toThrow('[0].price: Expected number, got "x"');
   });

   test("identifies missing fields without inserting values", () => {
      const input = { nested: {} };
      expect(() => j.object({ nested: j.object({ price: j.number() }) }).parse(input))
         .toThrow("nested.price: Expected number, got undefined");
      expect(input).toEqual({ nested: {} });
   });

   test("keeps root validation errors free of a path prefix", () => {
      expect(() => j.number().parse("x"))
         .toThrow(new TypeError('Expected number, got "x"'));
   });

   test.each(["parse", "serialize"] as const)(
      "preserves the original custom %s error without mutating it",
      (operation) => {
         const cause = Object.freeze(new RangeError("Rejected value"));
         const codec = j.custom<string>({
            parse() { throw cause; },
            serialize() { throw cause; },
         });
         const schema = j.object({ items: j.tuple(j.record(codec.nullable())).array() });

         // Reusing the same error must not accumulate paths from earlier calls.
         for (const key of ["first", "second"]) {
            let error: unknown;
            try {
               schema[operation]({ items: [[{ [key]: "x" }]] });
            } catch (caught) {
               error = caught;
            }
            expect(error).toBeInstanceOf(TypeError);
            expect(error).toMatchObject({
               message: `items[0][0].${key}: Rejected value`,
               cause,
            });
            expect((error as Error).cause).toBe(cause);
         }
         expect(cause.message).toBe("Rejected value");
      },
   );

   test("adds paths to built-in serialization failures", () => {
      expect(() => j.object({ at: j.date() }).serialize({ at: new Date(NaN) }))
         .toThrow("at: Invalid time value");
   });

   test("preserves paths from schemas used inside a custom codec", () => {
      const codec = j.custom({
         parse: (data) => j.object({ price: j.number() }).parse(data),
         serialize: (data) => data,
      });
      expect(() => j.object({ item: codec }).parse({ item: { price: "x" } }))
         .toThrow('item.price: Expected number, got "x"');
   });

   test("handles non-Error values thrown by custom codecs", () => {
      const codec = j.custom<string>({
         parse() { throw "Rejected value"; },
         serialize: (data) => data,
      });
      expect(() => j.object({ item: codec }).parse({ item: "x" }))
         .toThrow("item: Rejected value");
   });

   test("does not lose validation errors when input cannot be JSON-stringified", () => {
      expect(() => j.object({ price: j.number() }).parse({ price: 1n }))
         .toThrow("price: Expected number, got 1n");

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(() => j.object({ price: j.number() }).parse({ price: circular }))
         .toThrow("price: Expected number, got [unserializable value]");
   });
});
