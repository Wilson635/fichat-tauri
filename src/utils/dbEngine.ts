/** Identify the DBMS from a connection URL / DSN — not a hardcoded product name. */

const SCHEMES: { test: RegExp; label: string }[] = [
  { test: /^(postgres(ql)?):/i, label: "PostgreSQL" },
  { test: /^jdbc:postgresql/i, label: "PostgreSQL" },
  { test: /^(oracle|oracledb):/i, label: "Oracle" },
  { test: /^jdbc:oracle/i, label: "Oracle" },
  { test: /^mysql:/i, label: "MySQL" },
  { test: /^jdbc:mysql/i, label: "MySQL" },
  { test: /^mariadb:/i, label: "MariaDB" },
  { test: /^(mssql|sqlserver):/i, label: "SQL Server" },
  { test: /^jdbc:sqlserver/i, label: "SQL Server" },
  { test: /^sqlite:/i, label: "SQLite" },
  { test: /^cockroachdb:/i, label: "CockroachDB" },
  { test: /^mongodb(\+srv)?:/i, label: "MongoDB" },
];

export function dbEngineLabel(url: string | null | undefined): string {
  if (!url || url === "mock") return "Base de données";
  const raw = url.trim();
  for (const { test, label } of SCHEMES) {
    if (test.test(raw)) return label;
  }
  if (/\bCONNECT_DATA\b|\bSERVICE_NAME\b|\(DESCRIPTION\s*=/i.test(raw)) {
    return "Oracle";
  }
  if (/User\s*Id\s*=|Initial\s+Catalog\s*=/i.test(raw)) {
    return "SQL Server";
  }
  return "SGBD";
}
