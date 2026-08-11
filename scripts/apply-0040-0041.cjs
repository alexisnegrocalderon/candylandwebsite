// Aplica las migraciones 0040 (operators.email) y 0041 (siteSettings
// kitchenVendorName/kitchenVendorEmail) a mano, sin pasar por
// `drizzle-kit migrate` -- su CLI no soporta el flag SSL que exige TiDB
// Serverless ("Connections using insecure transport are prohibited"),
// mismo problema que ya se resolvió así en la migración 0039. Cada paso es
// idempotente (columna ya existe -> se salta). Al final registra los
// hashes en __drizzle_migrations para que `pnpm run db:push` siga
// funcionando normal de acá en adelante.
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CATCHUP = ["0040_mature_wendell_rand", "0041_bored_talon"];

function isIgnorable(err) {
  return ["ER_DUP_FIELDNAME"].includes(err.code);
}

async function run(conn, label, sql) {
  try {
    await conn.query(sql);
    console.log(`OK: ${label}`);
  } catch (e) {
    if (isIgnorable(e)) {
      console.log(`SKIP (ya aplicado): ${label} -- ${e.code}`);
    } else {
      throw new Error(`FAIL: ${label} -- ${e.code || e.message}`);
    }
  }
}

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  await run(conn, "operators ADD email", "ALTER TABLE `operators` ADD `email` varchar(320)");
  await run(conn, "siteSettings ADD kitchenVendorName", "ALTER TABLE `siteSettings` ADD `kitchenVendorName` varchar(255)");
  await run(conn, "siteSettings ADD kitchenVendorEmail", "ALTER TABLE `siteSettings` ADD `kitchenVendorEmail` varchar(320)");

  console.log("--- Poniendo al día __drizzle_migrations (0040-0041) ---");
  const [existing] = await conn.query("SELECT hash FROM `__drizzle_migrations`");
  const existingHashes = new Set(existing.map((r) => r.hash));

  for (const tag of CATCHUP) {
    const filePath = path.join(__dirname, "..", "drizzle", `${tag}.sql`);
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    if (existingHashes.has(hash)) {
      console.log(`SKIP (ya registrado): ${tag}`);
      continue;
    }
    await conn.query("INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)", [hash, Date.now()]);
    console.log(`REGISTRADO: ${tag}`);
  }

  const [opCols] = await conn.query("SHOW COLUMNS FROM `operators`");
  const [ssCols] = await conn.query("SHOW COLUMNS FROM `siteSettings`");
  console.log("OPERATORS_COLUMNS_FINAL:", JSON.stringify(opCols.map((c) => c.Field)));
  console.log("SITESETTINGS_COLUMNS_FINAL:", JSON.stringify(ssCols.map((c) => c.Field)));

  await conn.end();
  console.log("DONE");
}

main().catch((e) => {
  console.error("APPLY_FAILED:", e);
  process.exit(1);
});
