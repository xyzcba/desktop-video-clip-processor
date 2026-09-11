/**
 * Caption Fonts Directory & Custom Font Utilities
 * 15+ curated fonts commonly used by creators and video editors.
 */

export interface FontOption {
  name: string;
  family: string;
  category: 'sans-serif' | 'display' | 'custom';
  description: string;
}

export const CURATED_FONTS: FontOption[] = [
  { name: 'Montserrat', family: 'Montserrat, sans-serif', category: 'sans-serif', description: 'Modern geometric clean sans' },
  { name: 'Arial', family: 'Arial, sans-serif', category: 'sans-serif', description: 'Universal clean neutral sans' },
  { name: 'Impact', family: 'Impact, sans-serif', category: 'display', description: 'Bold punchy viral headline font' },
  { name: 'Trebuchet MS', family: '"Trebuchet MS", sans-serif', category: 'sans-serif', description: 'Dynamic humanist sans' },
  { name: 'Bebas Neue', family: '"Bebas Neue", sans-serif', category: 'display', description: 'Tall condensed display font' },
  { name: 'Anton', family: 'Anton, sans-serif', category: 'display', description: 'Heavy condensed impact sans' },
  { name: 'Poppins', family: 'Poppins, sans-serif', category: 'sans-serif', description: 'Geometric friendly modern sans' },
  { name: 'Roboto', family: 'Roboto, sans-serif', category: 'sans-serif', description: 'Crisp balanced neo-grotesque' },
  { name: 'Open Sans', family: '"Open Sans", sans-serif', category: 'sans-serif', description: 'Clean neutral readable sans' },
  { name: 'Oswald', family: 'Oswald, sans-serif', category: 'display', description: 'Classic editorial condensed sans' },
  { name: 'Inter', family: 'Inter, sans-serif', category: 'sans-serif', description: 'High-legibility digital UI sans' },
  { name: 'Helvetica', family: 'Helvetica, Arial, sans-serif', category: 'sans-serif', description: 'Timeless Swiss modernist sans' },
  { name: 'Verdana', family: 'Verdana, sans-serif', category: 'sans-serif', description: 'Wide high-contrast screen font' },
  { name: 'Tahoma', family: 'Tahoma, sans-serif', category: 'sans-serif', description: 'Compact crisp sans-serif' },
  { name: 'DejaVu Sans', family: '"DejaVu Sans", sans-serif', category: 'sans-serif', description: 'Broad unicode robust sans' },
];

export const FONT_NAMES: string[] = CURATED_FONTS.map((f) => f.name);
