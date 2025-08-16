-- database/init.sql
-- Initialize G-Code Analyzer Database

-- Create database if it doesn't exist (handled by Docker)
-- Create user and grant permissions (handled by Docker)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id VARCHAR(255) PRIMARY KEY,
  filepath VARCHAR(500) NOT NULL,
  filename VARCHAR(255),
  filesize BIGINT,
  timestamp BIGINT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'processing',
  metadata JSONB,
  profile JSONB,
  geometry JSONB,
  layers JSONB,
  suggestions JSONB,
  error_message TEXT,
  processing_time INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create batch_jobs table
CREATE TABLE IF NOT EXISTS batch_jobs (
  id VARCHAR(255) PRIMARY KEY,
  files JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table (for future user management)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  preferences JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create file_metadata table for caching
CREATE TABLE IF NOT EXISTS file_metadata (
  id SERIAL PRIMARY KEY,
  filepath VARCHAR(500) UNIQUE NOT NULL,
  filename VARCHAR(255),
  filesize BIGINT,
  checksum VARCHAR(64),
  last_modified TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create optimization_profiles table
CREATE TABLE IF NOT EXISTS optimization_profiles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('speed', 'quality', 'material')),
  constraints JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_filename ON analyses(filename);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created ON batch_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_metadata_filepath ON file_metadata(filepath);
CREATE INDEX IF NOT EXISTS idx_file_metadata_checksum ON file_metadata(checksum);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insert default optimization profiles
INSERT INTO optimization_profiles (name, description, priority, constraints) VALUES
('Speed Focused', 'Optimize for fastest print time', 'speed', '{"maxPrintTime": null, "minQuality": 60}'),
('Quality Focused', 'Optimize for best quality', 'quality', '{"maxPrintTime": null, "minQuality": 90}'),
('Material Efficient', 'Minimize material usage', 'material', '{"maxMaterial": null, "minQuality": 70}'),
('Balanced', 'Balance between speed, quality and material', 'speed', '{"maxPrintTime": null, "minQuality": 75}')
ON CONFLICT DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_analyses_updated_at BEFORE UPDATE ON analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_batch_jobs_updated_at BEFORE UPDATE ON batch_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_file_metadata_updated_at BEFORE UPDATE ON file_metadata FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_optimization_profiles_updated_at BEFORE UPDATE ON optimization_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create sample data for testing (optional)
-- Uncomment to insert test data
-- INSERT INTO analyses (id, filepath, filename, timestamp, status, metadata) VALUES
-- ('test_analysis_1', '/uploads/test.gcode', 'test.gcode', extract(epoch from now()) * 1000, 'complete', '{"slicer": "PrusaSlicer", "version": "2.6.0"}');

COMMIT;
