import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function traitsPlugin(): Plugin {
	function syncTraitFiles() {
		const baseDir = path.resolve('static/traits');
		if (!fs.existsSync(baseDir)) return;
		const files: string[] = [];
		const dirs = fs.readdirSync(baseDir, { withFileTypes: true });
		for (const dir of dirs) {
			if (dir.isDirectory()) {
				const category = dir.name;
				const items = fs.readdirSync(path.join(baseDir, category));
				for (const item of items) {
					if (item.endsWith('.png')) {
						files.push(`/traits/${category}/${item}`);
					}
				}
			}
		}
		const targetPath = path.resolve('src/lib/utils/traitFiles.json');
		const content = JSON.stringify(files, null, 2);
		if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf-8') !== content) {
			fs.writeFileSync(targetPath, content);
		}
	}

	return {
		name: 'vite-plugin-trait-files',
		buildStart() {
			syncTraitFiles();
		},
		handleHotUpdate({ file }) {
			if (file.includes('static/traits')) {
				syncTraitFiles();
			}
		}
	};
}

export default defineConfig({
	plugins: [
		traitsPlugin(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	]
});
