#!/bin/bash
# Create directories for tiles
mkdir -p tiles/detailed
mkdir -p tiles/simplified

# Grid parameters
WEST=4.33
EAST=4.41
SOUTH=50.83
NORTH=50.89
COLS=8
ROWS=6

# Calculate tile dimensions
TILE_WIDTH=$(echo "($EAST-$WEST)/$COLS" | bc -l)
TILE_HEIGHT=$(echo "($NORTH-$SOUTH)/$ROWS" | bc -l)

# UPDATED: Source file is now the GeoPackage file
SOURCE_FILE="bxl_wgs84_with_height.gpkg"

echo "Generating ${COLS}x${ROWS} tiles from $SOURCE_FILE..."

if [ ! -f "$SOURCE_FILE" ]; then
  echo "ERROR: Source file $SOURCE_FILE not found!"
  exit 1
fi

# Generate tiles from the GeoPackage file
for COL in $(seq 0 $(($COLS-1))); do
  for ROW in $(seq 0 $(($ROWS-1))); do
    # Calculate bounds for this tile
    TILE_WEST=$(echo "$WEST + $COL * $TILE_WIDTH" | bc -l)
    TILE_EAST=$(echo "$WEST + ($COL + 1) * $TILE_WIDTH" | bc -l)
    TILE_SOUTH=$(echo "$SOUTH + $ROW * $TILE_HEIGHT" | bc -l)
    TILE_NORTH=$(echo "$SOUTH + ($ROW + 1) * $TILE_HEIGHT" | bc -l)
    
    echo "Creating tile ${COL}_${ROW}..."
    # Extract data for this geographic area
    ogr2ogr -f GeoJSON "tile_${COL}_${ROW}.geojson" "$SOURCE_FILE" \
      -spat $TILE_WEST $TILE_SOUTH $TILE_EAST $TILE_NORTH
      
    # Copy to detailed directory
    echo "Creating detailed tile ${COL}_${ROW}..."
    cp "tile_${COL}_${ROW}.geojson" "tiles/detailed/tile_${COL}_${ROW}.geojson"
    
    echo "Creating simplified tile ${COL}_${ROW}..."
    # Create simplified version with less detail
    ogr2ogr -f GeoJSON "tiles/simplified/tile_${COL}_${ROW}.geojson" "tile_${COL}_${ROW}.geojson" -simplify 2.0
  done
done

echo "Tile preparation complete!"
echo "- Detailed tiles in: tiles/detailed/"
echo "- Simplified tiles in: tiles/simplified/"