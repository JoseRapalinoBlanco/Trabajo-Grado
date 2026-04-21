CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS turbidity_data (
    id BIGSERIAL,
    measurement_date TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    rrs_665 DOUBLE PRECISION,
    tt_pred DOUBLE PRECISION
);

-- Convert to TimescaleDB hypertable partitioned by time
SELECT create_hypertable('turbidity_data', 'measurement_date', if_not_exists => TRUE);

-- Spatial index
CREATE INDEX IF NOT EXISTS geom_idx ON turbidity_data USING GIST (geom);

-- Sentinel-2 Table (separate algorithms)
CREATE TABLE IF NOT EXISTS turbidity_data_s2 (
    id BIGSERIAL,
    measurement_date TIMESTAMPTZ NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    tur_eljaiek DOUBLE PRECISION,
    tur_dogliotti2015 DOUBLE PRECISION,
    tur_nechad2009_665 DOUBLE PRECISION
);

SELECT create_hypertable('turbidity_data_s2', 'measurement_date', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS geom_idx_s2 ON turbidity_data_s2 USING GIST (geom);
