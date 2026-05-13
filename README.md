# Glowlytics Monorepo

This repository has been reorganized into a clearer monorepo layout.

## Structure

```text
apps/
  glowlytics/          # Expo React Native mobile app
    backend/           # Express API used by the mobile app
  landing/             # Next.js marketing + SEO site
research/
  ml/                  # Model training, notebooks, and data tooling
docs/                  # Product and engineering docs
```

## Compatibility Aliases

To keep existing scripts and docs working during migration, these legacy paths currently point to the new locations:

- `RadianceIQ` -> `apps/glowlytics`
- `landing` -> `apps/landing`
- `ml` -> `research/ml`

## Quick Start

```bash
# Mobile app
npm run mobile:start

# Mobile typecheck/tests
npm run mobile:typecheck
npm run mobile:test

# Backend
npm run backend:dev
npm run backend:test

# Landing site
npm run landing:dev
npm run landing:build
```

