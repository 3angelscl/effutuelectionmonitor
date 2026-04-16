import "dotenv/config";
import { defineConfig } from "prisma/config";

const datasourceUrl = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];

if (!datasourceUrl) {
  throw new Error("Set DIRECT_URL or DATABASE_URL to your Supabase Postgres connection string");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
