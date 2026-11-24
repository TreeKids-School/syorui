export const STAFF_COLORS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // purple
  '#db2777', // pink
  '#0891b2', // cyan
  '#ea580c', // orange
  '#0d9488', // teal
  '#4f46e5', // indigo
  '#65a30d', // lime
];

export const resolveStaffColor = (colorValue?: string, fallbackIndex: number = 0): string => {
          if (!colorValue || typeof colorValue !== 'string') {
            return STAFF_COLORS[fallbackIndex % STAFF_COLORS.length];
          }
          const trimmed = colorValue.trim();
          if (trimmed.startsWith('#') || trimmed.startsWith('rgb') || trimmed.startsWith('hsl')) {
            return trimmed;
          }
          const colorMap: Record<string, string> = {
            blue: '#2563eb',
            red: '#dc2626',
            green: '#16a34a',
            emerald: '#059669',
            amber: '#d97706',
            yellow: '#ca8a04',
            purple: '#7c3aed',
            pink: '#db2777',
            cyan: '#0891b2',
            orange: '#ea580c',
            teal: '#0d9488',
            indigo: '#4f46e5',
            lime: '#65a30d',
            rose: '#e11d48',
          };
          const lower = trimmed.toLowerCase();
          for (const [key, val] of Object.entries(colorMap)) {
            if (lower.includes(key)) return val;
          }
          return trimmed;
        };
