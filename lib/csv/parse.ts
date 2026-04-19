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
      transformHeader: (h) => h.trim(),
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
  return columns.some((c) => c.toLowerCase() === "email");
}
