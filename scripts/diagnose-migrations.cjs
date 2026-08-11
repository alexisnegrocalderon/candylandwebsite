// Diagnóstico de una sola vez (no forma parte del código de la app): lee el
// estado real de la base contra lo que Drizzle cree que ya se aplicó. Solo
// lee, no modifica nada.
const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  try {
    const [rows] = await conn.query(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY created_at DESC LIMIT 5"
    );
    console.log("LATEST_MIGRATIONS:", JSON.stringify(rows));
  } catch (e) {
    console.log("MIGRATIONS_TABLE_ERROR:", e.message);
  }

  for (const t of ["operators", "siteSettings"]) {
    try {
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
      console.log(
        `${t.toUpperCase()}_COLUMNS:`,
        JSON.stringify(cols.map((c) => c.Field))
      );
    } catch (e) {
      console.log(`${t.toUpperCase()}_COLUMNS_ERROR:`, e.message);
    }
  }

  await conn.end();
}

main().catch((e) => {
  console.error("DIAGNOSE_FAILED:", e);
  process.exit(1);
});
