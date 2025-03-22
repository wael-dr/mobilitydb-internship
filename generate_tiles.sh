#!/bin/bash
# Grid parameters (maintain for reference but we'll use the entire area)
WEST=4.33
EAST=4.41
SOUTH=50.83
NORTH=50.89

# UPDATED: Source file is now the GeoPackage file
SOURCE_FILE="bxl_wgs84_with_height.gpkg"

echo "Generating a single tile from $SOURCE_FILE..."

if [ ! -f "$SOURCE_FILE" ]; then
  echo "ERROR: Source file $SOURCE_FILE not found!"
  exit 1
fi

# Generate a single tile covering the entire area
echo "Creating single tile..."
# Extract data for the entire geographic area
ogr2ogr -f GeoJSON "tile_full.geojson" "$SOURCE_FILE" \
  -spat $WEST $SOUTH $EAST $NORTH

echo "Tile preparation complete!"
echo "- Tile created: tile_full.geojson"