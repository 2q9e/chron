import { defineConfig, globalIgnores } from 'eslint/config'
import next from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'
import typescript from 'typescript-eslint'

export default defineConfig([
  ...typescript.configs.recommended,
  next.configs['core-web-vitals'],
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // This rule's pages-directory lookup is for the Pages Router; Chron uses the App Router.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
