
var locations: {[x: string]: string} = {
  '1': 'Maison'
};

export function getLocations() {
  return locations;
};

export function getLocation(locationId: string) {
  return locations[locationId];
};

