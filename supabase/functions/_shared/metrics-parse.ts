// Turning a model's raw metric report into storable values.
//
// Pure, so src/test/metrics-parse.test.ts covers the same code the edge
// function runs. Worth testing on its own: Skool renders an unset field as an
// em dash, and reading that as 0 would silently zero MRR and drag the whole
// portfolio run-rate down. Absent and zero must never collapse into each other.

export interface Partitioned {
  /** Real readings, safe to store. */
  metrics: Record<string, number>;
  /** Keys the model saw but which had no value. Left blank, never zeroed. */
  absent: string[];
}

/** Fields that are commentary, not measurements. */
const NON_METRIC = new Set(["notes", "period_label", "platform"]);

export function partitionParsedMetrics(raw: Record<string, unknown>): Partitioned {
  const metrics: Record<string, number> = {};
  const absent: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (NON_METRIC.has(key)) continue;

    if (value === null || value === undefined) {
      absent.push(key);
      continue;
    }
    // A numeric string is still a reading; anything else is not trustworthy.
    const n = typeof value === "number" ? value : Number(value);
    if (typeof value === "boolean" || !Number.isFinite(n)) {
      absent.push(key);
      continue;
    }
    // Negative counts and rates are never real on these dashboards.
    if (n < 0) {
      absent.push(key);
      continue;
    }
    metrics[key] = n;
  }

  return { metrics, absent };
}
