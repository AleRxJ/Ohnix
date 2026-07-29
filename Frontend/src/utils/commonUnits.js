// Common measurement units with symbols and categories
export const COMMON_UNITS = [
  // Weight
  { id: "kg", name: "Kilogram", symbol: "kg", category: "Weight" },
  { id: "g", name: "Gram", symbol: "g", category: "Weight" },
  { id: "mg", name: "Milligram", symbol: "mg", category: "Weight" },
  { id: "lb", name: "Pound", symbol: "lb", category: "Weight" },
  { id: "oz", name: "Ounce", symbol: "oz", category: "Weight" },
  { id: "ton", name: "Metric Ton", symbol: "t", category: "Weight" },

  // Volume
  { id: "l", name: "Liter", symbol: "L", category: "Volume" },
  { id: "ml", name: "Milliliter", symbol: "mL", category: "Volume" },
  { id: "gal", name: "Gallon", symbol: "gal", category: "Volume" },
  { id: "fl_oz", name: "Fluid Ounce", symbol: "fl oz", category: "Volume" },
  { id: "cup", name: "Cup", symbol: "cup", category: "Volume" },
  { id: "tbsp", name: "Tablespoon", symbol: "tbsp", category: "Volume" },
  { id: "tsp", name: "Teaspoon", symbol: "tsp", category: "Volume" },

  // Length
  { id: "m", name: "Meter", symbol: "m", category: "Length" },
  { id: "cm", name: "Centimeter", symbol: "cm", category: "Length" },
  { id: "mm", name: "Millimeter", symbol: "mm", category: "Length" },
  { id: "km", name: "Kilometer", symbol: "km", category: "Length" },
  { id: "ft", name: "Foot", symbol: "ft", category: "Length" },
  { id: "in", name: "Inch", symbol: "in", category: "Length" },

  // Area
  { id: "m2", name: "Square Meter", symbol: "m²", category: "Area" },
  { id: "cm2", name: "Square Centimeter", symbol: "cm²", category: "Area" },
  { id: "km2", name: "Square Kilometer", symbol: "km²", category: "Area" },
  { id: "hectare", name: "Hectare", symbol: "ha", category: "Area" },

  // Piece/Count
  { id: "piece", name: "Piece", symbol: "pcs", category: "Count" },
  { id: "unit", name: "Unit", symbol: "u", category: "Count" },
  { id: "dozen", name: "Dozen", symbol: "doz", category: "Count" },
  { id: "box", name: "Box", symbol: "box", category: "Count" },
  { id: "pack", name: "Pack", symbol: "pack", category: "Count" },
  { id: "bundle", name: "Bundle", symbol: "bundle", category: "Count" },

  // Time
  { id: "hour", name: "Hour", symbol: "h", category: "Time" },
  { id: "min", name: "Minute", symbol: "min", category: "Time" },
  { id: "sec", name: "Second", symbol: "s", category: "Time" },
  { id: "day", name: "Day", symbol: "d", category: "Time" },
];

export const UNIT_CATEGORIES = [
  "Weight",
  "Volume",
  "Length",
  "Area",
  "Count",
  "Time",
];

export const getUnitsByCategory = (category) => {
  return COMMON_UNITS.filter((unit) => unit.category === category);
};
