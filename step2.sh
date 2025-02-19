#!/bin/bash
INPUT_GPKG="bxl_wgs84.gpkg"
OUTPUT_DIR="tiles"
LAYERS=("BuildingFaces_WGS84" "EngineeringWorkFaces_WGS84")

# Clean previous runs
rm -rf "$OUTPUT_DIR" *.csv

# Convert each layer to CSV
for LAYER in "${LAYERS[@]}"; do
  echo "Exporting layer $LAYER to CSV..."
  ogr2ogr -f CSV "${LAYER}.csv" "$INPUT_GPKG" \
    -sql "SELECT id, ST_X(ST_Centroid(geom)) AS x, ST_Y(ST_Centroid(geom)) AS y, COALESCE(ST_Z(ST_Centroid(geom)), 0) AS z FROM \"$LAYER\""

  # Check if CSV file was created and is non-empty
  if [ ! -s "${LAYER}.csv" ]; then
    echo "ERROR: ${LAYER}.csv is empty or was not created!"
    exit 1
  fi

  # Clean CSV data (remove header and non-numeric characters)
  sed -i -e '1d' \
         -e '/^,,/d' \
         -e 's/[^0-9.,-]//g' \
         -e '/^$/d' \
         -e 's/,,*/,/g' \
         "${LAYER}.csv"
done

# Activate your virtual environment and run py3dtiles conversion
source venv/bin/activate
py3dtiles convert \
  --srs_in 4326 \
  --srs_out 4978 \
  --out "$OUTPUT_DIR" \
  --overwrite \
  ./*.csv
deactivate

# Cleanup CSV files
rm -f ./*.csv
echo "3D Tiles generated in: $OUTPUT_DIR"
