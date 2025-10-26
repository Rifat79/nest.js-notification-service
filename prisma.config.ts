import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl, // TypeScript now knows this is a string
  },
  migrations: {
    path: 'prisma/migrations',
  },
  engine: 'classic',
});
