#!/bin/bash

echo "Starting cleanup process..."

# Remove all tile GeoJSON files
echo "Removing tile GeoJSON files..."
rm -f tile_*.geojson
TILE_COUNT=$(ls -1 tile_*.geojson 2>/dev/null | wc -l)
if [ "$TILE_COUNT" -eq 0 ]; then
  echo "✓ All tile GeoJSON files removed"
else
  echo "! Some tile GeoJSON files could not be removed"
fi

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

# Remove tiles directory if it exists
if [ -d tiles ]; then
  echo "Removing tiles directory..."
  rm -rf tiles
  if [ ! -d tiles ]; then
    echo "✓ tiles directory removed"
  else
    echo "! Failed to remove tiles directory"
  fi
fi

echo "Cleanup completed! Only original data preserved."
