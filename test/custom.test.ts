import { describe, expect, expectTypeOf, test } from "vitest";
import { j, type TypedJson } from "../src/index.js";

const url = j.custom({
   parse(data) {
      return new URL(j.string().parse(data));
   },
   serialize(data) {
      return data.href;
   },
});

describe("custom codecs", () => {
   test("infers the parsed value and serialization argument", () => {
      expectTypeOf(url).toEqualTypeOf<TypedJson<URL>>();
      expectTypeOf(url.serialize).parameter(0).toEqualTypeOf<URL>();
      expectTypeOf(url.nullable().array().parse).returns.toEqualTypeOf<(URL | null)[]>();
   });

   test("round-trips custom values in composed schemas", () => {
      const schema = j.object({ links: url.nullable().array() });
      const value = { links: [new URL("https://example.com/jobs"), null] };
      const serialized = schema.serialize(value);

      expect(serialized).toEqual({ links: ["https://example.com/jobs", null] });
      expect(schema.parse(JSON.parse(JSON.stringify(serialized)))).toEqual(value);
      expect(url.array().nullable().parse(null)).toBeNull();
   });

   test("delegates validation to the codec", () => {
      expect(() => url.parse(42)).toThrow("Expected string, got 42");
      expect(() => url.parse("not a URL")).toThrow(TypeError);
   });
});
