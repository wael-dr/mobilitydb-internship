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

# Remove JSON cache files
echo "Removing JSON files..."
rm -f *.json
LOG_COUNT=$(ls -1 *.json 2>/dev/null | wc -l)
if [ "$LOG_COUNT" -eq 0 ]; then
  echo "✓ All JSON files removed"
else
  echo "! Some JSON files could not be removed"
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
