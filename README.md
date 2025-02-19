# MobilityDB Internship Project

This project is a tool for converting and visualizing geospatial data into 3D Tiles format for use in CesiumJS. The process involves creating a virtual environment, installing dependencies, and running several scripts to convert and serve the data.

## Prerequisites

Before you start, ensure that you have the following installed:

- **Python 3**: Make sure you have Python 3 installed on your system. You can check this by running `python3 --version`.
- **GDAL**: A geospatial data library required for some of the processes.
- **Node.js and http-server**: For serving the 3D Tiles.

## Installation

Follow these steps to get your environment set up:

### 1. Install system dependencies

First, install the necessary system packages:

```bash
# Install GDAL (Geospatial Data Abstraction Library)
sudo apt-get install gdal-bin

# Install Python 3 pip (Python package manager)
sudo apt install python3-pip

# Install Python 3 venv (Virtual environment manager)
sudo apt-get install python3-venv -y

# Install Node.js http-server (for serving 3D Tiles)
sudo apt install node-http-server
```

### 2. Set up your Python environment

Next, create and activate a virtual environment:

```bash
# Create a virtual environment in a directory called "venv"
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate
```

Once the virtual environment is active, you can install the required Python packages.

### 3. Install required Python packages

Install the necessary dependencies using `pip`:

```bash
# Install py3dtiles for converting GeoJSON to 3D Tiles format
pip install py3dtiles
```

If you encounter any issues related to permissions while installing packages, you may need to change ownership of the directory:

```bash
# Change ownership of the current directory
sudo chown -R $(whoami):$(whoami) .
```

After installing the packages, you can deactivate the virtual environment once done:

```bash
# Deactivate the virtual environment when finished
deactivate
```

### 4. Download Data

You will need to download the GeoPackage data from the Brussels Datastore.

### 5. Run Scripts

Now, you can run the following scripts to convert the data into 3D Tiles:

- **WGS84 Transformation Script**:
   ```bash
   ./wgs84.sh
   ```

- **GeoPackage to 3D Tiles Conversion Script**:
   ```bash
   ./wgs84to3dtiles.sh
   ```

### 6. Serve the 3D Tiles

To view the 3D tiles in a browser, you will need to serve them using an HTTP server. Use the following command:

```bash
# Start the HTTP server to serve the 3D Tiles locally
http-server --cors -p 8000
```

This will start a server on port `8000` with CORS enabled, allowing you to view your 3D Tiles in a web browser.

---

## Project Structure

- `step1.sh`: Script that transforms the GeoPackage data from EPSG:31370 (Belgian Lambert 72) to EPSG:4326 (WGS84).
- `step2.sh`: Converts the geospatial data into 3D Tiles format using `py3dtiles`.
- `index.html`: The web page that loads the 3D Tiles into CesiumJS for visualization.

---

## Notes

- Make sure you always activate the virtual environment before running the scripts or installing dependencies.
- The server will run locally on `http://localhost:8000`. Open this URL in a browser to view the 3D Tiles visualization.
