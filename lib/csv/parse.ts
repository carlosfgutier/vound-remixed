import Papa from "papaparse";

export type ParsedCsv = {
  records: Record<string, string>[];
  columns: string[];
  errors: string[];
};

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // Normalize headers: trim, lowercase, and collapse whitespace to `_`.
      // The rest of the system (schema refine on `r.email`, the
      // STANDARD_CONTACT_COLUMNS set in actions.ts, and `record.email`
      // writes) all assume lowercase snake_case keys. Without this
      // normalization a CSV with "Email" / "First Name" style headers
      // would pass the column-name check but fail zod's record refine
      // and bounce the user back to the contacts step on submit.
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (result) => {
        const columns = result.meta.fields ?? [];
        const records = result.data
          .map((row) => {
            const clean: Record<string, string> = {};
            for (const key of columns) {
              const v = row[key];
              clean[key] = (v ?? "").toString().trim();
            }
            return clean;
          })
          .filter((r) => Object.values(r).some((v) => v.length > 0));
        const errors = result.errors.map((e) => `${e.type}: ${e.message}`);
        resolve({ records, columns, errors });
      },
    });
  });
}

export function hasEmailColumn(columns: string[]): boolean {
  // Headers are already normalized to lowercase by parseCsvFile, but keep
  // the case-insensitive check so callers passing raw column arrays (tests,
  // future non-CSV importers) still get the expected behavior.
  return columns.some((c) => c.toLowerCase() === "email");
}
