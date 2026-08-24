/**
 * Curated category vocabulary used to anchor the AI's naming.
 *
 * Two consumers share this list and must not drift apart:
 * - `inventory.ts` returns it from `getCategoryLibrary()` when the database has
 *   no values of its own yet, so a fresh install still gets a usable vocabulary.
 * - `ai-analysis.ts` renders it in every prompt as the "curated examples" block,
 *   which the model should prefer over inventing something new.
 *
 * Pure data, no imports beyond a type: this module ends up in the `@/services`
 * barrel, which is reachable from `'use client'` code.
 *
 * Conventions for every entry: Title Case, 1-3 words, alphabetically sorted,
 * no brand names, and `itemType` values singular (they are display names for a
 * kind of thing, not a count of them).
 */
import type { CategoryLibrary } from './ai-analysis';

/**
 * How many existing values per tier are rendered into a prompt. Enough to
 * anchor the vocabulary without burning the context window on a large
 * inventory; in experimental mode the `searchCategories` tool reaches the rest.
 */
export const MAX_CATEGORY_EXAMPLES = 30;

/**
 * `functional` is the coarsest tier — what broad domain does this belong to.
 * Deliberately kept general: anything that names a kind of tool rather than a
 * domain belongs in `specific` instead.
 */
const functional = [
  '3D Printing',
  'Audio Video',
  'Automotive',
  'Cleaning',
  'Craft',
  'Electrical',
  'Electronics',
  'Furniture',
  'Garden',
  'Hardware',
  'Kitchen',
  'Lab Equipment',
  'Materials',
  'Measurement',
  'Mechanical',
  'Medical',
  'Networking',
  'Office',
  'Optics',
  'Outdoor',
  'Plumbing',
  'Pneumatics',
  'Power Systems',
  'Robotics',
  'Safety',
  'Sporting Goods',
  'Storage',
  'Textiles',
  'Tools',
  'Woodworking',
];

/**
 * `specific` narrows the domain to a family of things. This is where
 * `Fasteners` lives — it is a family of parts, not a domain of its own.
 */
const specific = [
  'Abrasives',
  'Adhesives',
  'Batteries',
  'Cables',
  'Cleaning Supplies',
  'Computer Components',
  'Connectors',
  'Cutting Tools',
  'Electrical Components',
  'Fasteners',
  'Filament',
  'Hand Tools',
  'Kitchenware',
  'Lab Gear',
  'Lighting',
  'Lubricants',
  'Measuring Tools',
  'Microcontrollers',
  'Office Supplies',
  'Paint Finishes',
  'Plumbing Fittings',
  'Power Tools',
  'Raw Stock',
  'Safety Gear',
  'Sensors',
  'Soldering',
  'Storage Bins',
  'Test Equipment',
  'Tool Accessories',
  'Wiring',
];

/**
 * `itemType` is the primary display name — the concise generic noun a person
 * would use for the thing. Singular, even for parts that come in quantity
 * ("Screw", not "Screws"), so the same kind always renders identically.
 */
const itemType = [
  'Adapter',
  'Arduino',
  'Battery',
  'Bin',
  'Bolt',
  'Cable',
  'Caliper',
  'Clamp',
  'Drill',
  'Glove',
  'Hammer',
  'Multimeter',
  'Nut',
  'Oscilloscope',
  'Pliers',
  'Power Supply',
  'Raspberry Pi',
  'Resistor Kit',
  'Safety Glasses',
  'Sander',
  'Saw',
  'Screw',
  'Screwdriver',
  'Sensor Module',
  'Soldering Iron',
  'Tape Measure',
  'Toolbox',
  'Washer',
  'Wire Spool',
  'Wrench',
];

export const CURATED_CATEGORIES: CategoryLibrary = {
  functional,
  specific,
  itemType,
};
