import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  { ignores: ['main.js', 'node_modules/**', 'tests/**', 'scripts/**', 'docs/**', 'examples/**', 'eslint.config.mjs'] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      'obsidianmd/ui/sentence-case': ['error', { brands: ['Just Simple Calendar', 'Simple Calendar', 'Infinite Calendar', 'Bases', 'Monday', 'Sunday'] }],
    },
  },
]);
