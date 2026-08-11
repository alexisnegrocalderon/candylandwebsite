// Aplica la migración 0039 (eventId en operators/devices/registers) a mano,
// sin pasar por `drizzle-kit migrate`, porque la tabla de control
// __drizzle_migrations de producción quedó desincronizada del schema real
// (0032-0038 ya están aplicadas en la base pero no registradas -- ver
// scripts/diagnose-migrations.cjs). Cada paso es idempotente: si ya se
// corrió antes (columna ya existe, índice ya existe), lo salta en vez de
// fallar. Al final deja la tabla de control al día para 0032-0039, para que
// `pnpm run db:push` vuelva a funcionar normal de acá en adelante.
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CANDYLAND_SLUG = "candyland-agosto-2026";

const CATCHUP = [
  { idx: 32, tag: "0032_plain_husk" },
  { idx: 33, tag: "0033_known_polaris" },
  { idx: 34, tag: "0034_keen_lord_tyger" },
  { idx: 35, tag: "0035_graceful_demogoblin" },
  { idx: 36, tag: "0036_clumsy_imperial_guard" },
  { idx: 37, tag: "0037_majestic_luckman" },
  { idx: 38, tag: "0038_bright_vengeance" },
  { idx: 39, tag: "0039_robust_baron_zemo" },
];

function isIgnorable(err) {
  return [
    "ER_DUP_FIELDNAME", // ALTER TABLE ADD de una columna que ya existe
    "ER_DUP_KEYNAME", // CREATE INDEX de un índice que ya existe
  ].includes(err.code);
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

  const [eventRows] = await conn.query(
    "SELECT id, title FROM `events` WHERE `slug` = ?",
    [CANDYLAND_SLUG]
  );
  if (eventRows.length !== 1) {
    throw new Error(
      `No se encontró (o hay más de uno) el evento Candyland con slug "${CANDYLAND_SLUG}" -- abortando sin tocar nada.`
    );
  }
  console.log("CANDYLAND_EVENT:", JSON.stringify(eventRows[0]));

  await run(conn, "devices ADD eventId", "ALTER TABLE `devices` ADD `eventId` int");
  await run(conn, "operators ADD eventId", "ALTER TABLE `operators` ADD `eventId` int");
  await run(conn, "registers ADD eventId", "ALTER TABLE `registers` ADD `eventId` int");

  await run(
    conn,
    "devices backfill eventId",
    `UPDATE \`devices\` SET \`eventId\` = (SELECT id FROM \`events\` WHERE slug = '${CANDYLAND_SLUG}') WHERE \`eventId\` IS NULL`
  );
  await run(
    conn,
    "operators backfill eventId",
    `UPDATE \`operators\` SET \`eventId\` = (SELECT id FROM \`events\` WHERE slug = '${CANDYLAND_SLUG}') WHERE \`eventId\` IS NULL`
  );
  await run(
    conn,
    "registers backfill eventId",
    `UPDATE \`registers\` SET \`eventId\` = (SELECT id FROM \`events\` WHERE slug = '${CANDYLAND_SLUG}') WHERE \`eventId\` IS NULL`
  );

  await run(conn, "devices eventId NOT NULL", "ALTER TABLE `devices` MODIFY COLUMN `eventId` int NOT NULL");
  await run(conn, "operators eventId NOT NULL", "ALTER TABLE `operators` MODIFY COLUMN `eventId` int NOT NULL");
  await run(conn, "registers eventId NOT NULL", "ALTER TABLE `registers` MODIFY COLUMN `eventId` int NOT NULL");

  await run(conn, "devices_event_idx", "CREATE INDEX `devices_event_idx` ON `devices` (`eventId`)");
  await run(conn, "operators_event_idx", "CREATE INDEX `operators_event_idx` ON `operators` (`eventId`)");
  await run(conn, "registers_event_idx", "CREATE INDEX `registers_event_idx` ON `registers` (`eventId`)");

  console.log("--- Poniendo al día __drizzle_migrations (0032-0039) ---");
  const [existing] = await conn.query("SELECT hash FROM `__drizzle_migrations`");
  const existingHashes = new Set(existing.map((r) => r.hash));

  for (const { tag } of CATCHUP) {
    const filePath = path.join(__dirname, "..", "drizzle", `${tag}.sql`);
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    if (existingHashes.has(hash)) {
      console.log(`SKIP (ya registrado): ${tag}`);
      continue;
    }
    await conn.query(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [hash, Date.now()]
    );
    console.log(`REGISTRADO: ${tag}`);
  }

  const [cols] = await conn.query("SHOW COLUMNS FROM `operators`");
  console.log("OPERATORS_COLUMNS_FINAL:", JSON.stringify(cols.map((c) => c.Field)));

  await conn.end();
  console.log("DONE");
}

main().catch((e) => {
  console.error("APPLY_FAILED:", e);
  process.exit(1);
});
