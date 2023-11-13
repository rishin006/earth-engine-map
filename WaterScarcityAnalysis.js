// Define study area as a geometry or feature collection
var studyArea = ee.FeatureCollection("projects/ee-rishinds22/assets/proj");

// Define the specific date ranges
var dateRanges = [
  ['2019-02-22', '2019-02-24'],
  ['2020-02-17', '2020-02-19'],
  ['2021-02-01', '2021-02-03'],
  ['2022-02-06', '2022-02-08'],
  ['2019-04-13', '2019-04-15'],
  ['2020-04-27', '2020-04-29'],
  ['2021-03-03', '2021-03-05'],
  ['2022-03-08', '2022-03-10'],
  ['2019-09-20', '2019-09-22'],
  ['2020-07-06', '2020-07-08'],
  ['2021-09-18', '2021-09-22'],
  ['2022-08-24', '2022-08-27'],
  ['2019-11-19', '2019-11-22'],
  ['2020-10-04', '2020-10-06'],
  ['2021-12-16', '2021-12-20'],
  ['2022-11-23', '2022-11-25']
];

// Initialize the Water Scarcity Index (WSI) collection
var wsiCollection;

// Create a chart panel to display the time series chart
var chartPanel = ui.Panel();
ui.root.add(chartPanel);

// Create a panel for the project description
var projectDescriptionPanel = ui.Panel({
  style: {
    width: '10%', // You can adjust the width as needed
    position: 'bottom-left', // Position it at the bottom left
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    padding: '8px',
    textAlign: 'left',
  }
});

// Add a text box explaining the project to the panel
var projectDescription = ui.Label('This project assesses and analyzes water scarcity levels in Pothencode Panchayath. Click on the selected area to view results.', {
  fontSize: '10px',
  margin: '0',
});
projectDescriptionPanel.add(projectDescription);

// Add the projectDescriptionPanel to the UI
ui.root.add(projectDescriptionPanel);

// Add legends or references
var legends = ui.Panel({
  style: {
    position: 'bottom-left', // Adjusted position to bottom-left
    padding: '8px 15px',
    backgroundColor: 'white', // Added a background color for better visibility
  },
});

var legendTitle = ui.Label('Water Scarcity Index (WSI) Legends', { fontWeight: 'bold' });
legends.add(legendTitle);

var lowScarcityLabel = ui.Label('WSI < 0.1: Low Water Scarcity');
var moderateScarcityLabel = ui.Label('0.1 <= WSI < 0.2: Moderate Water Scarcity');
var highScarcityLabel = ui.Label('WSI >= 0.2: High Water Scarcity');

legends.add(lowScarcityLabel);
legends.add(moderateScarcityLabel);
legends.add(highScarcityLabel);

// Add the legends panel to the user interface
ui.root.add(legends);

// Define the center coordinates for Pothencode Panchayat, Trivandrum, Kerala
var pothencodePanchayatCenter = ee.Geometry.Point([76.9, 8.6]); // Longitude, Latitude

// Function to update the map and chart for all available dates
function updateMapAndChart() {
  // Remove all layers from the map
  Map.layers().reset();
  
  // Set the map's center to Pothencode Panchayat
  Map.centerObject(pothencodePanchayatCenter, 13); // Adjust the zoom level as needed

  // Initialize an empty image collection for the date ranges
  var dateRangeCollection = ee.ImageCollection([]);
  
  // Loop through the date ranges and add images to the collection
  for (var i = 0; i < dateRanges.length; i++) {
    var dates = dateRanges[i];
    var startDate = dates[0];
    var endDate = dates[1];

    var sentinelCollection = ee.ImageCollection('COPERNICUS/S2')
      .filterDate(startDate, endDate)
      .filterBounds(studyArea);

    dateRangeCollection = dateRangeCollection.merge(sentinelCollection);
  }

  // Clip the image collection to the study area
  var clippedCollection = dateRangeCollection.map(function (image) {
    return image.clip(studyArea);
  });

  // Display the clipped image collection on the map
  var clippedVis = { bands: ['B4', 'B3', 'B2'], min: 0, max: 3000 };
  Map.addLayer(clippedCollection, clippedVis, 'Images');

  // Calculate NDVI for the clipped collection
  var ndviCollection = clippedCollection.map(function (image) {
    var ndvi = image.normalizedDifference(['B8', 'B4']); // NIR (B8) and Red (B4) bands
    return ndvi.rename('NDVI').copyProperties(image, ['system:time_start']);
  });

  // Calculate Soil Moisture Index (SMI) for the clipped collection
  var smiCollection = clippedCollection.map(function (image) {
    var smi = image.expression(
      '(B11 - B8) / (B11 + B8)', // SWIR2 (B11) and NIR (B8) bands
      { 'B11': image.select('B11'), 'B8': image.select('B8') }
    );
    return smi.rename('SMI').copyProperties(image, ['system:time_start']);
  });

  // Calculate Water Scarcity Index (WSI) using a formula
wsiCollection = ndviCollection.map(function (ndviImage) {
  // Find the corresponding SMI image for the current NDVI image
  var currentDate = ee.Date(ndviImage.get('system:time_start'));
  var nextDate = currentDate.advance(1, 'day');
  
  var smiImage = smiCollection
    .filterDate(currentDate, nextDate)
    .mean();  // Calculate the mean SMI for the day

  // Define the formula coefficients (adjust as needed)
  var ndviCoefficient = 0.4;
  var smiCoefficient = 0.6;

  // Calculate the Water Scarcity Index (WSI)
  var wsi = ndviImage.select('NDVI').multiply(ndviCoefficient)
    .add(smiImage.select('SMI').multiply(smiCoefficient))
    .rename('WSI').copyProperties(ndviImage, ['system:time_start']);

  return wsi;
});

  
  // Define a custom palette for WSI values
  var customPalette = [
    '0000ff',  // WSI < -0.05 (Blue)
    '00ff00',  // -0.05 <= WSI < 0.0 (Green)
    'ffff00',  // 0.0 <= WSI < 0.1 (Yellow)
    'ffa500',  // 0.1 <= WSI < 0.2 (Orange)
    'ff0000',  // 0.2 <= WSI < 0.3 (Red)
    '800080',  // 0.3 <= WSI < 0.4 (Purple)
  ];

  // Rearrange the colors based on gradients of red
  customPalette = customPalette.reverse();

  // Display the Water Scarcity Index (WSI) layer on the map with the custom palette
  var wsiVis = {
    min: -0.5,
    max: 0.5,
    palette: customPalette
  };

  // Add the WSI layer to the map
  Map.addLayer(wsiCollection, wsiVis, 'Water Scarcity Index');
}

// Function to update the chart
function updateChart(point) {
  // Create a time series chart for the clicked point
  var chart = ui.Chart.image.seriesByRegion({
    imageCollection: wsiCollection.select('WSI'),
    regions: ee.FeatureCollection(point),
    reducer: ee.Reducer.mean(),
    scale: 30,
    xProperty: 'system:time_start',
  }).setOptions({
    title: 'WSI Time Series',
    hAxis: {
      title: 'Date',
    },
    vAxis: {
      title: 'WSI Value',
      minValue: 0,
      maxValue: 1,
    },
  });

  // Clear the chart panel and add the new chart
  chartPanel.clear();
  chartPanel.add(chart);
}

// Click handler to update the map and chart when the map is clicked
Map.onClick(function (coords) {
  var point = ee.Geometry.Point(coords.lon, coords.lat);

  // Update the map and chart
  updateMapAndChart();
  updateChart(point);
});

// Initialize the map and chart
updateMapAndChart();
