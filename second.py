import os
import sys
import fiona
from shapely.geometry import shape
import numpy as np
from tqdm import tqdm
import gc  # Garbage collection

# Check if file exists
filename = 'bxl_wgs84.gpkg'
if not os.path.exists(filename):
    print(f"Error: File {filename} does not exist")
    sys.exit(1)

print(f"Processing file: {filename}")

# Function to safely extract Z values from MultiPolygon
def extract_z_from_multipolygon(multi_geom):
    try:
        # MultiPolygons need to be handled by accessing their parts
        z_values = []
        
        # Access the polygon parts of the multipolygon
        for poly in multi_geom.geoms:
            # Get exterior ring coordinates
            exterior_coords = list(poly.exterior.coords)
            if exterior_coords and len(exterior_coords[0]) > 2:
                # Add Z values from the exterior
                z_values.extend([p[2] for p in exterior_coords])
                
            # Get interior ring coordinates
            for interior in poly.interiors:
                interior_coords = list(interior.coords)
                if interior_coords and len(interior_coords[0]) > 2:
                    z_values.extend([p[2] for p in interior_coords])
        
        # Return mean Z if we found any
        if z_values:
            return np.mean(z_values)
        else:
            return None
    except Exception as e:
        return None

# Process the file in a safer way
try:
    # First get schema info
    with fiona.open(filename, 'r') as src:
        crs = src.crs
        schema = src.schema.copy()
        count = len(src)
    
    # Update schema to include height field
    schema['properties']['height'] = 'float'
    
    print(f"Found {count} features with CRS: {crs}")
    
    output_file = 'bxl_wgs84_with_height.gpkg'
    if os.path.exists(output_file):
        os.remove(output_file)
    
    processed_count = 0
    height_count = 0
    
    # Create output file and copy features with height
    with fiona.open(filename, 'r') as source:
        # Use the same schema and CRS for the output
        with fiona.open(output_file, 'w', 
                        driver='GPKG', 
                        schema=schema,
                        crs=crs) as sink:
            
            # Process each feature one by one
            for feature in tqdm(source, total=count, desc="Processing features"):
                try:
                    # Copy the feature (don't modify the original)
                    new_feature = {
                        'geometry': dict(feature['geometry']),  # Make a dict copy instead of .copy()
                        'properties': dict(feature['properties']),
                        'id': feature.get('id')
                    }
                    
                    # Extract height
                    height = None
                    geom = shape(feature['geometry'])
                    if geom.has_z:
                        height = extract_z_from_multipolygon(geom)
                    
                    # Add height to properties
                    new_feature['properties']['height'] = height
                    
                    # Write directly to output file
                    sink.write(new_feature)
                    
                    processed_count += 1
                    if height is not None:
                        height_count += 1
                        
                except Exception as e:
                    print(f"Error processing feature: {e}")
                
                # Force garbage collection occasionally
                if processed_count % 1000 == 0:
                    gc.collect()
    
    print(f"Successfully processed {processed_count} features")
    print(f"Features with height values: {height_count} out of {processed_count}")
    print(f"Results saved to {output_file}")

except Exception as e:
    print(f"Error processing file: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)