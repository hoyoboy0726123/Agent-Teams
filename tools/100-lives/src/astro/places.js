// US birthplaces: every state's largest city, the 100 most populous US cities, and a few more that were large
// for much of 1950–2025 or are the obvious choice for a region (deduplicated, about 150 in all).
//
// Each place is { name, state, lat, lon, tz }: latitude north and longitude east in degrees (so US longitudes are
// negative), rounded to 0.01° (about 1 km; one degree of longitude moves the Ascendant by about a degree, so this
// is far finer than a birth time is known), and the IANA time zone whose history covers the city. Watch the zones
// with their own history: most of Indiana (no DST 1971–2005), Arizona (no DST since 1968), Detroit, Louisville,
// Boise, Juneau and Honolulu. Anywhere else can be entered by hand as { name, state, lat, lon, tz }.

const E = "America/New_York", C = "America/Chicago", M = "America/Denver", P = "America/Los_Angeles";
const AZ = "America/Phoenix", IN = "America/Indiana/Indianapolis", DET = "America/Detroit", AK = "America/Anchorage";
const HI = "Pacific/Honolulu";

// [state, state name, [[city, lat, lon, tz], …]], largest city first.
const RAW = [
  ["AL", "Alabama", [["Huntsville", 34.73, -86.59, C], ["Birmingham", 33.52, -86.81, C], ["Montgomery", 32.37, -86.30, C], ["Mobile", 30.69, -88.04, C]]],
  ["AK", "Alaska", [["Anchorage", 61.22, -149.90, AK], ["Fairbanks", 64.84, -147.72, AK], ["Juneau", 58.30, -134.42, "America/Juneau"]]],
  ["AZ", "Arizona", [["Phoenix", 33.45, -112.07, AZ], ["Tucson", 32.22, -110.97, AZ], ["Mesa", 33.42, -111.83, AZ], ["Chandler", 33.31, -111.84, AZ], ["Gilbert", 33.35, -111.79, AZ], ["Glendale", 33.54, -112.19, AZ], ["Scottsdale", 33.49, -111.93, AZ]]],
  ["AR", "Arkansas", [["Little Rock", 34.75, -92.29, C]]],
  ["CA", "California", [
    ["Los Angeles", 34.05, -118.24, P], ["San Diego", 32.72, -117.16, P], ["San Jose", 37.34, -121.89, P], ["San Francisco", 37.77, -122.42, P],
    ["Fresno", 36.74, -119.79, P], ["Sacramento", 38.58, -121.49, P], ["Long Beach", 33.77, -118.19, P], ["Oakland", 37.80, -122.27, P],
    ["Bakersfield", 35.37, -119.02, P], ["Anaheim", 33.84, -117.91, P], ["Stockton", 37.96, -121.29, P], ["Riverside", 33.95, -117.40, P],
    ["Irvine", 33.68, -117.83, P], ["Santa Ana", 33.75, -117.87, P], ["Chula Vista", 32.64, -117.08, P], ["San Bernardino", 34.11, -117.29, P],
    ["Fremont", 37.55, -121.99, P], ["Modesto", 37.64, -121.00, P],
  ]],
  ["CO", "Colorado", [["Denver", 39.74, -104.99, M], ["Colorado Springs", 38.83, -104.82, M], ["Aurora", 39.73, -104.83, M]]],
  ["CT", "Connecticut", [["Bridgeport", 41.19, -73.20, E], ["New Haven", 41.31, -72.92, E], ["Hartford", 41.76, -72.68, E], ["Stamford", 41.05, -73.54, E]]],
  ["DE", "Delaware", [["Wilmington", 39.74, -75.55, E]]],
  ["DC", "District of Columbia", [["Washington", 38.91, -77.04, E]]],
  ["FL", "Florida", [
    ["Jacksonville", 30.33, -81.66, E], ["Miami", 25.76, -80.19, E], ["Tampa", 27.95, -82.46, E], ["Orlando", 28.54, -81.38, E],
    ["St. Petersburg", 27.77, -82.64, E], ["Hialeah", 25.86, -80.28, E], ["Port St. Lucie", 27.27, -80.35, E], ["Cape Coral", 26.56, -81.95, E],
    ["Tallahassee", 30.44, -84.28, E], ["Fort Lauderdale", 26.12, -80.14, E], ["Pensacola", 30.42, -87.22, C],
  ]],
  ["GA", "Georgia", [["Atlanta", 33.75, -84.39, E], ["Augusta", 33.47, -81.97, E], ["Columbus", 32.46, -84.99, E], ["Savannah", 32.08, -81.09, E]]],
  ["HI", "Hawaii", [["Honolulu", 21.31, -157.86, HI], ["Hilo", 19.71, -155.08, HI]]],
  ["ID", "Idaho", [["Boise", 43.62, -116.20, "America/Boise"]]],
  ["IL", "Illinois", [["Chicago", 41.88, -87.63, C], ["Rockford", 42.27, -89.09, C], ["Peoria", 40.69, -89.59, C], ["Springfield", 39.80, -89.64, C]]],
  ["IN", "Indiana", [["Indianapolis", 39.77, -86.16, IN], ["Fort Wayne", 41.08, -85.14, IN], ["Evansville", 37.97, -87.57, C], ["Gary", 41.59, -87.35, C]]],
  ["IA", "Iowa", [["Des Moines", 41.59, -93.62, C], ["Cedar Rapids", 41.98, -91.67, C]]],
  ["KS", "Kansas", [["Wichita", 37.69, -97.34, C], ["Overland Park", 38.98, -94.67, C], ["Kansas City", 39.11, -94.63, C], ["Topeka", 39.05, -95.68, C]]],
  ["KY", "Kentucky", [["Louisville", 38.25, -85.76, "America/Kentucky/Louisville"], ["Lexington", 38.04, -84.50, E]]],
  ["LA", "Louisiana", [["New Orleans", 29.95, -90.07, C], ["Baton Rouge", 30.45, -91.19, C], ["Shreveport", 32.53, -93.75, C]]],
  ["ME", "Maine", [["Portland", 43.66, -70.26, E]]],
  ["MD", "Maryland", [["Baltimore", 39.29, -76.61, E]]],
  ["MA", "Massachusetts", [["Boston", 42.36, -71.06, E], ["Worcester", 42.26, -71.80, E], ["Springfield", 42.10, -72.59, E]]],
  ["MI", "Michigan", [["Detroit", 42.33, -83.05, DET], ["Grand Rapids", 42.96, -85.67, DET], ["Lansing", 42.73, -84.56, DET], ["Flint", 43.01, -83.69, DET], ["Ann Arbor", 42.28, -83.74, DET]]],
  ["MN", "Minnesota", [["Minneapolis", 44.98, -93.27, C], ["Saint Paul", 44.95, -93.09, C], ["Duluth", 46.79, -92.10, C]]],
  ["MS", "Mississippi", [["Jackson", 32.30, -90.18, C]]],
  ["MO", "Missouri", [["Kansas City", 39.10, -94.58, C], ["St. Louis", 38.63, -90.20, C], ["Springfield", 37.21, -93.29, C]]],
  ["MT", "Montana", [["Billings", 45.78, -108.50, M], ["Missoula", 46.87, -113.99, M]]],
  ["NE", "Nebraska", [["Omaha", 41.26, -95.93, C], ["Lincoln", 40.81, -96.70, C]]],
  ["NV", "Nevada", [["Las Vegas", 36.17, -115.14, P], ["Henderson", 36.04, -114.98, P], ["Reno", 39.53, -119.81, P], ["North Las Vegas", 36.20, -115.12, P]]],
  ["NH", "New Hampshire", [["Manchester", 42.99, -71.46, E]]],
  ["NJ", "New Jersey", [["Newark", 40.74, -74.17, E], ["Jersey City", 40.73, -74.08, E], ["Paterson", 40.92, -74.17, E], ["Trenton", 40.22, -74.76, E]]],
  ["NM", "New Mexico", [["Albuquerque", 35.08, -106.65, M], ["Las Cruces", 32.32, -106.76, M], ["Santa Fe", 35.69, -105.94, M]]],
  ["NY", "New York", [["New York", 40.71, -74.01, E], ["Buffalo", 42.89, -78.88, E], ["Yonkers", 40.93, -73.90, E], ["Rochester", 43.16, -77.61, E], ["Syracuse", 43.05, -76.15, E], ["Albany", 42.65, -73.76, E]]],
  ["NC", "North Carolina", [["Charlotte", 35.23, -80.84, E], ["Raleigh", 35.78, -78.64, E], ["Greensboro", 36.07, -79.79, E], ["Durham", 35.99, -78.90, E], ["Winston-Salem", 36.10, -80.24, E]]],
  ["ND", "North Dakota", [["Fargo", 46.88, -96.79, C], ["Bismarck", 46.81, -100.78, C]]],
  ["OH", "Ohio", [["Columbus", 39.96, -83.00, E], ["Cleveland", 41.50, -81.69, E], ["Cincinnati", 39.10, -84.51, E], ["Toledo", 41.65, -83.54, E], ["Akron", 41.08, -81.52, E], ["Dayton", 39.76, -84.19, E]]],
  ["OK", "Oklahoma", [["Oklahoma City", 35.47, -97.52, C], ["Tulsa", 36.15, -95.99, C]]],
  ["OR", "Oregon", [["Portland", 45.52, -122.68, P], ["Salem", 44.94, -123.04, P], ["Eugene", 44.05, -123.09, P]]],
  ["PA", "Pennsylvania", [["Philadelphia", 39.95, -75.17, E], ["Pittsburgh", 40.44, -80.00, E], ["Allentown", 40.60, -75.49, E], ["Erie", 42.13, -80.09, E], ["Scranton", 41.41, -75.66, E]]],
  ["RI", "Rhode Island", [["Providence", 41.82, -71.41, E]]],
  ["SC", "South Carolina", [["Charleston", 32.78, -79.93, E], ["Columbia", 34.00, -81.03, E], ["Greenville", 34.85, -82.40, E]]],
  ["SD", "South Dakota", [["Sioux Falls", 43.54, -96.73, C], ["Rapid City", 44.08, -103.23, M]]],
  ["TN", "Tennessee", [["Nashville", 36.16, -86.78, C], ["Memphis", 35.15, -90.05, C], ["Knoxville", 35.96, -83.92, E], ["Chattanooga", 35.05, -85.31, E]]],
  ["TX", "Texas", [
    ["Houston", 29.76, -95.37, C], ["San Antonio", 29.42, -98.49, C], ["Dallas", 32.78, -96.80, C], ["Austin", 30.27, -97.74, C],
    ["Fort Worth", 32.76, -97.33, C], ["El Paso", 31.76, -106.49, M], ["Arlington", 32.74, -97.11, C], ["Corpus Christi", 27.80, -97.40, C],
    ["Plano", 33.02, -96.70, C], ["Lubbock", 33.58, -101.86, C], ["Laredo", 27.51, -99.51, C], ["Irving", 32.81, -96.95, C],
    ["Garland", 32.91, -96.64, C], ["Frisco", 33.15, -96.82, C], ["Amarillo", 35.22, -101.83, C], ["Beaumont", 30.08, -94.13, C],
  ]],
  ["UT", "Utah", [["Salt Lake City", 40.76, -111.89, M], ["Provo", 40.23, -111.66, M]]],
  ["VT", "Vermont", [["Burlington", 44.48, -73.21, E]]],
  ["VA", "Virginia", [["Virginia Beach", 36.85, -75.98, E], ["Chesapeake", 36.77, -76.29, E], ["Norfolk", 36.85, -76.29, E], ["Richmond", 37.54, -77.44, E]]],
  ["WA", "Washington", [["Seattle", 47.61, -122.33, P], ["Spokane", 47.66, -117.43, P], ["Tacoma", 47.25, -122.44, P], ["Vancouver", 45.64, -122.66, P]]],
  ["WV", "West Virginia", [["Charleston", 38.35, -81.63, E]]],
  ["WI", "Wisconsin", [["Milwaukee", 43.04, -87.91, C], ["Madison", 43.07, -89.40, C]]],
  ["WY", "Wyoming", [["Cheyenne", 41.14, -104.82, M]]],
];

// Grouped by state for a <select>: [{ state: "TX", stateName: "Texas", places: [{ name, state, lat, lon, tz }, …] }, …]
export const PLACES = RAW.map(([state, stateName, list]) => ({
  state, stateName,
  places: list.map(([name, lat, lon, tz]) => Object.freeze({ name, state, lat, lon, tz })),
}));

export const ALL_PLACES = PLACES.flatMap(g => g.places);

const norm = s => String(s || "").trim().toLowerCase().replace(/\./g, "").replace(/^saint /, "st ").replace(/\s+/g, " ");

// findPlace("Austin", "TX") → the place, or null. Case and "St."/"Saint" do not matter. Without a state, the most
// populous city of that name (the first in the list) is returned.
export function findPlace(name, state = null) {
  const n = norm(name), st = state ? String(state).trim().toUpperCase() : null;
  return ALL_PLACES.find(p => norm(p.name) === n && (!st || p.state === st)) || null;
}

// Display label: "Austin, TX".
export const placeLabel = p => (p ? `${p.name}, ${p.state}` : "");
