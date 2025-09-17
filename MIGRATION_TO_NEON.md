# Migration from Turso to Neon

This document outlines the migration from Turso (SQLite) to Neon (PostgreSQL) for the Should I Watch This application.

## Changes Made

### 1. Prisma Schema (`prisma/schema.prisma`)
- Changed provider from `sqlite` to `postgresql`
- Updated environment variable from `TURSO_DATABASE_URL` to `DATABASE_URL`
- Removed `previewFeatures` and `binaryTargets` (no longer needed for PostgreSQL)

### 2. Prisma Client (`src/lib/prisma.ts`)
- Removed LibSQL adapter import and configuration
- Simplified client creation to use standard PostgreSQL connection
- Updated error messages to reference `DATABASE_URL`

### 3. Dependencies (`package.json`)
- Removed Turso-specific packages:
  - `@libsql/client`
  - `@prisma/adapter-libsql`
- Added PostgreSQL driver:
  - `pg` (PostgreSQL client)
  - `@types/pg` (TypeScript types)

### 4. Database Scripts
- Updated `scripts/deploy-db.js` to use `DATABASE_URL` instead of Turso credentials
- Updated `scripts/setup-db.js` to include schema pushing with `prisma db push`

## Environment Variables

### Required Environment Variable
Replace your Turso environment variables with a single Neon connection string:

```bash
# Remove these (Turso)
TURSO_DATABASE_URL=...
TURSO_AUTH_TOKEN=...

# Add this (Neon)
DATABASE_URL=postgresql://username:password@hostname:port/database?sslmode=require
```

### Getting Your Neon Connection String

1. Sign up for a Neon account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from your Neon dashboard
4. The connection string format is:
   ```
   postgresql://[user]:[password]@[neon-hostname]/[dbname]?sslmode=require
   ```

## Migration Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables
Set your `DATABASE_URL` environment variable with your Neon connection string.

### 3. Generate Prisma Client
```bash
npx prisma generate
```

### 4. Push Schema to Database
```bash
npm run db:setup
```

### 5. Verify Connection
```bash
npm run db:deploy
```

## Vercel Deployment

### Environment Variables in Vercel
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Remove the old Turso variables:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
4. Add the new Neon variable:
   - `DATABASE_URL` with your Neon connection string

### Build Configuration
The existing `vercel.json` configuration should work without changes. The PostgreSQL driver (`pg`) is compatible with Vercel's serverless environment.

## Benefits of Neon over Turso

1. **Better Vercel Integration**: Neon is designed to work seamlessly with Vercel
2. **PostgreSQL**: Full PostgreSQL compatibility with advanced features
3. **Connection Pooling**: Built-in connection pooling for better performance
4. **Branching**: Database branching for development workflows
5. **Monitoring**: Better observability and monitoring tools

## Troubleshooting

### Connection Issues
- Ensure your `DATABASE_URL` includes `?sslmode=require`
- Check that your Neon project is active and not paused
- Verify your connection string format

### Schema Issues
- Run `npx prisma db push` to sync your schema
- Use `npx prisma studio` to inspect your database
- Check Prisma logs for detailed error messages

### Build Issues
- Ensure all dependencies are installed: `npm install`
- Regenerate Prisma client: `npx prisma generate`
- Check that `@types/pg` is installed for TypeScript support
