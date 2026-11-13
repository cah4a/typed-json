import { describe, expect, expectTypeOf, test } from "vitest";
import { j, type TypedJson } from "../src/index.js";

const payloadSchema = j.object({
   id: j.bigint(),
   name: j.string(),
   count: j.number(),
   at: j.date(),
   tags: j.string().array(),
   nested: j.object({ ids: j.bigint().array() }),
   kind: j.literal("a", 2, true),
   range: j.tuple(j.date(), j.number()),
   counts: j.record(j.bigint()),
   hash: j.bytes(),
});

const value: ReturnType<typeof payloadSchema.parse> = {
   id: -123456789012345678901234567890n,
   name: "name",
   count: 1.5,
   at: new Date("2026-01-02T03:04:05.678Z"),
   tags: ["a", "b"],
   nested: { ids: [0n, 1n] },
   kind: 2,
   range: [new Date("2026-01-01T00:00:00.000Z"), 7],
   counts: { first: 1n },
   hash: new Uint8Array([0, 1, 254, 255]),
};

describe("typed-json", () => {
   test("serializes to plain JSON", () => {
      expect(payloadSchema.serialize(value)).toEqual({
         id: "-123456789012345678901234567890",
         name: "name",
         count: 1.5,
         at: "2026-01-02T03:04:05.678Z",
         tags: ["a", "b"],
         nested: { ids: ["0", "1"] },
         kind: 2,
         range: ["2026-01-01T00:00:00.000Z", 7],
         counts: { first: "1" },
         hash: "AAH+/w==",
      });
   });

   test("survives JSON round trip", () => {
      const wire = JSON.parse(JSON.stringify(payloadSchema.serialize(value)));

      expect(payloadSchema.parse(wire)).toEqual(value);
   });

   test("drops unknown keys", () => {
      expect(j.object({ a: j.number() }).parse({ a: 1, b: 2 })).toEqual({
         a: 1,
      });
   });

   test("exports TypedJson with typed parse and serialize", () => {
      const schema: TypedJson<Date> = j.date();

      expectTypeOf(schema.parse).returns.toEqualTypeOf<Date>();
      expectTypeOf(schema.serialize).parameter(0).toEqualTypeOf<Date>();
   });

   test("infers literal and tuple types", () => {
      expectTypeOf(j.literal("a", 2, true).parse).returns.toEqualTypeOf<
         "a" | 2 | true
      >();
      expectTypeOf(j.tuple(j.string(), j.bigint()).parse).returns.toEqualTypeOf<
         [string, bigint]
      >();
   });

   test.each([
      [Number.NaN, "NaN"],
      [Number.POSITIVE_INFINITY, "Infinity"],
      [Number.NEGATIVE_INFINITY, "-Infinity"],
   ])("encodes %s as string", (number, wire) => {
      const numberSchema = j.number();

      expect(numberSchema.serialize(number)).toBe(wire);
      expect(numberSchema.parse(wire)).toBe(number);
   });

   test.each([
      ["missing key", { a: 1 }],
      ["null", null],
      ["array", []],
   ])("rejects %s as object", (_, data) => {
      expect(() => j.object({ b: j.number() }).parse(data)).toThrow(TypeError);
   });

   test.each([
      ["string", j.string(), 1],
      ["number", j.number(), "1"],
      ["number from lowercase nan", j.number(), "nan"],
      ["bigint from number", j.bigint(), 1],
      ["bigint from decimal", j.bigint(), "1.5"],
      ["bigint from hex", j.bigint(), "0x10"],
      ["date from number", j.date(), 0],
      ["invalid date", j.date(), "not a date"],
      ["array", j.number().array(), { 0: 1 }],
      ["array item", j.number().array(), [1, "2"]],
      ["tuple length", j.tuple(j.number()), [1, 2]],
      ["tuple item", j.tuple(j.number(), j.string()), [1, 2]],
      ["record", j.record(j.number()), [1]],
      ["record value", j.record(j.number()), { a: "1" }],
      ["literal", j.literal("a", "b"), "c"],
      ["literal type", j.literal(1), "1"],
      ["bytes from number", j.bytes(), 1],
      ["bytes without padding", j.bytes(), "AAH+/w"],
      ["bytes from base64url", j.bytes(), "AAH-_w=="],
   ])("rejects invalid %s", (_, schema, data) => {
      expect(() => schema.parse(data)).toThrow(TypeError);
   });
});
