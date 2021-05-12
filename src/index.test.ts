import { TestExport } from "./index";

test("simply testing export from index", () => {
  expect(TestExport).not.toThrow();
});
