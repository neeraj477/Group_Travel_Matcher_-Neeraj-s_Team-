// Imported first by tests that touch the database: point it at a throwaway file, never the real app.db.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tripmate-test-"));
process.env.DB_PATH = path.join(dir, "test.db");
