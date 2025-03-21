#!/bin/bash
INPUT="bxl.gpkg"
OUTPUT="bxl_wgs84.gpkg"

# Delete previous output
rm -f "$OUTPUT"

# Reproject BuildingFaces (geometries are already 3D)
ogr2ogr -t_srs EPSG:4326 -f GPKG "$OUTPUT" "$INPUT" \
  -nln BuildingFaces_WGS84 \
  -sql "SELECT id, geom FROM BuildingFaces" \
  -progress

# Reproject EngineeringWorkFaces
ogr2ogr -update -t_srs EPSG:4326 -f GPKG "$OUTPUT" "$INPUT" \
  -nln EngineeringWorkFaces_WGS84 \
  -sql "SELECT id, geom FROM EngineeringWorkFaces" \
  -progress

echo "Reprojected to WGS84: $OUTPUT"
