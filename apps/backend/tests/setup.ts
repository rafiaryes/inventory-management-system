import { afterAll } from "bun:test";
import { closeDatabase } from "../src/db";

afterAll(async () => {
  await closeDatabase();
});
