const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ...(process.env.DATABASE_URL ? { ssl: { rejectUnauthorized: false } } : {}),
});

const schema = `
-- User profiles (user_id is the Clerk user ID string, e.g. 'user_2xABC...')
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  age_range VARCHAR(10) NOT NULL,
  location_coarse VARCHAR(100) NOT NULL,
  period_applicable VARCHAR(20) NOT NULL DEFAULT 'prefer_not',
  period_last_start_date DATE,
  cycle_length_days INTEGER DEFAULT 28,
  smoker_status BOOLEAN,
  drink_baseline_frequency VARCHAR(10),
  wearable_connected BOOLEAN DEFAULT FALSE,
  wearable_source VARCHAR(50),
  camera_permission_status VARCHAR(20) DEFAULT 'not_requested',
  health_connection JSONB DEFAULT '{}'::jsonb,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scan protocols
CREATE TABLE IF NOT EXISTS scan_protocols (
  protocol_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES user_profiles(user_id),
  primary_goal VARCHAR(20) NOT NULL,
  scan_region VARCHAR(30) NOT NULL,
  scan_frequency VARCHAR(10) DEFAULT 'daily',
  baseline_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Product catalog
CREATE TABLE IF NOT EXISTS product_catalog (
  user_product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES user_profiles(user_id),
  product_name VARCHAR(200) NOT NULL,
  product_capture_method VARCHAR(20) NOT NULL,
  ingredients_list TEXT[] NOT NULL DEFAULT '{}',
  usage_schedule VARCHAR(10) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Daily records
CREATE TABLE IF NOT EXISTS daily_records (
  daily_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES user_profiles(user_id),
  date DATE NOT NULL,
  scanner_reading_id UUID,
  scanner_indices JSONB NOT NULL DEFAULT '{}',
  scanner_quality_flag VARCHAR(10) DEFAULT 'pass',
  scan_region VARCHAR(30),
  photo_uri TEXT,
  photo_quality_flag VARCHAR(10),
  photo_angle_match_score FLOAT,
  photo_lighting_score FLOAT,
  sunscreen_used BOOLEAN NOT NULL,
  new_product_added BOOLEAN NOT NULL DEFAULT FALSE,
  period_status_confirmed VARCHAR(20),
  cycle_day_estimated INTEGER,
  sleep_quality VARCHAR(10),
  stress_level VARCHAR(10),
  drinks_yesterday VARCHAR(10),
  sleep_duration_minutes INTEGER,
  resting_hr INTEGER,
  hrv INTEGER,
  steps INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Model outputs
CREATE TABLE IF NOT EXISTS model_outputs (
  output_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_id UUID REFERENCES daily_records(daily_id),
  acne_score INTEGER NOT NULL,
  sun_damage_score INTEGER NOT NULL,
  skin_age_score INTEGER NOT NULL,
  confidence VARCHAR(10) DEFAULT 'low',
  primary_driver VARCHAR(100),
  recommended_action TEXT,
  escalation_flag BOOLEAN DEFAULT FALSE,
  signal_scores JSONB DEFAULT '{}',
  signal_features JSONB DEFAULT '{}',
  lesions JSONB DEFAULT '[]',
  signal_confidence JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  rag_recommendations JSONB DEFAULT '[]',
  personalized_feedback TEXT,
  zone_severity JSONB DEFAULT '{}',
  generated_insights JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Report artifacts
CREATE TABLE IF NOT EXISTS report_artifacts (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES user_profiles(user_id),
  date_range VARCHAR(20),
  included_fields TEXT[] DEFAULT '{}',
  report_uri TEXT,
  shared_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Waitlist signups (landing page)
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  source VARCHAR(50) DEFAULT 'landing',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_records_user_date ON daily_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_model_outputs_daily ON model_outputs(daily_id);
CREATE INDEX IF NOT EXISTS idx_products_user ON product_catalog(user_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
`;

// Migration: add new columns + migrate user_id from UUID to TEXT
const migration = `
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS signal_confidence JSONB DEFAULT '{}';
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]';
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS rag_recommendations JSONB DEFAULT '[]';
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS personalized_feedback TEXT;
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS zone_severity JSONB DEFAULT '{}';
ALTER TABLE model_outputs ADD COLUMN IF NOT EXISTS generated_insights JSONB DEFAULT '{}';
ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS brand VARCHAR(200);
`;

// Migration v2: convert user_id columns from UUID to TEXT for Clerk IDs
// This runs as separate statements since ALTER TYPE can fail if already TEXT
const migrationV2 = `
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    -- Drop FKs, alter types, re-add FKs
    ALTER TABLE report_artifacts DROP CONSTRAINT IF EXISTS report_artifacts_user_id_fkey;
    ALTER TABLE scan_protocols DROP CONSTRAINT IF EXISTS scan_protocols_user_id_fkey;
    ALTER TABLE product_catalog DROP CONSTRAINT IF EXISTS product_catalog_user_id_fkey;
    ALTER TABLE daily_records DROP CONSTRAINT IF EXISTS daily_records_user_id_fkey;

    ALTER TABLE user_profiles ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    ALTER TABLE user_profiles ALTER COLUMN user_id DROP DEFAULT;
    ALTER TABLE scan_protocols ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    ALTER TABLE product_catalog ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    ALTER TABLE daily_records ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
    ALTER TABLE report_artifacts ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

    ALTER TABLE scan_protocols ADD CONSTRAINT scan_protocols_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);
    ALTER TABLE product_catalog ADD CONSTRAINT product_catalog_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);
    ALTER TABLE daily_records ADD CONSTRAINT daily_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);
    ALTER TABLE report_artifacts ADD CONSTRAINT report_artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES user_profiles(user_id);

    RAISE NOTICE 'Migrated user_id columns from UUID to TEXT';
  END IF;
END $$;
`;

// Migration v3: add missing user_profiles columns for onboarding fields
const migrationV3 = `
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS skin_goal VARCHAR(30);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sex VARCHAR(20);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS menstrual_status VARCHAR(30);
`;

/**
 * Initialize schema using a provided pool (does NOT close it).
 * Runs CREATE TABLE IF NOT EXISTS + ALTER TABLE for migrations.
 */
async function initSchema(externalPool) {
  await externalPool.query(schema);
  try {
    await externalPool.query(migration);
  } catch (err) {
    console.warn('[db-init] Migration v1 warning (may be harmless):', err.message);
  }
  try {
    await externalPool.query(migrationV2);
  } catch (err) {
    console.warn('[db-init] Migration v2 warning (may be harmless):', err.message);
  }
  try {
    await externalPool.query(migrationV3);
  } catch (err) {
    console.warn('[db-init] Migration v3 warning (may be harmless):', err.message);
  }
}

// Standalone execution: `node db-init.js`
if (require.main === module) {
  (async () => {
    try {
      await initSchema(pool);
      console.log('Database schema initialized successfully.');
    } catch (err) {
      console.error('Error initializing database:', err.message);
    } finally {
      await pool.end();
    }
  })();
}

module.exports = { schema, initSchema };
