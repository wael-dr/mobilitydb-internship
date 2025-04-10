#!/bin/bash

echo "Starting cleanup process..."

# Remove reprojected GPKG files
echo "Removing reprojected GeoPackage files..."
rm -f bxl_wgs84.gpkg
if [ ! -f bxl_wgs84.gpkg ]; then
  echo "✓ bxl_wgs84.gpkg removed"
else
  echo "! Failed to remove bxl_wgs84.gpkg"
fi

rm -f bxl_wgs84_with_height.gpkg
if [ ! -f bxl_wgs84_with_height.gpkg ]; then
  echo "✓ bxl_wgs84_with_height.gpkg removed"
else
  echo "! Failed to remove bxl_wgs84_with_height.gpkg"
fi

# Check if the original file exists
if [ -f bxl.gpkg ]; then
  echo "✓ Original bxl.gpkg file preserved"
else
  echo "! Original bxl.gpkg file not found"
fi

# Check if GEOJSON files exist
if [ -f tile_full.geojson ]; then
  echo "✓ Original tile_full.geojson file preserved"
else
  echo "! Original tile_full.geojson file not found"
fi

# Remove JSON cache files
echo "Removing JSON cache files..."
rm -f vehicle_positions.json last_raw_response.json
if [ ! -f vehicle_positions.json ] && [ ! -f last_raw_response.json ]; then
  echo "✓ JSON cache files removed"
else
  echo "! Some JSON cache files could not be removed"
fi

# Remove log files
echo "Removing log files..."
rm -f *.log
LOG_COUNT=$(ls -1 *.log 2>/dev/null | wc -l)
if [ "$LOG_COUNT" -eq 0 ]; then
  echo "✓ All log files removed"
else
  echo "! Some log files could not be removed"
fi

# Remove PID files
echo "Removing PID files..."
rm -f *.pid
PID_COUNT=$(ls -1 *.pid 2>/dev/null | wc -l)
if [ "$PID_COUNT" -eq 0 ]; then
  echo "✓ All PID files removed"
else
  echo "! Some PID files could not be removed"
fi

echo "Cleanup completed! Only original data preserved."
