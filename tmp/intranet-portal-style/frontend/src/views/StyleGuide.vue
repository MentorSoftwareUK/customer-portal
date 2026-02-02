<template>
  <div class="max-w-6xl mx-auto my-6 space-y-8">
    <div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">UI Style Guide</h1>
      <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">Reference of common elements used across the app with Tailwind class snippets.</p>
    </div>

    <!-- Colors -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Color Hierarchy</h2>
      <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">Primary actions use blue; neutrals use gray. Dark mode uses `dark:` variants.</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="h-12 w-full rounded bg-blue-600" />
          <div class="mt-2 text-xs text-gray-700 dark:text-gray-300">Primary: <code class="font-mono">bg-blue-600 text-white</code></div>
        </div>
        <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="h-12 w-full rounded bg-green-600" />
          <div class="mt-2 text-xs text-gray-700 dark:text-gray-300">Success: <code class="font-mono">bg-green-600 text-white</code></div>
        </div>
        <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="h-12 w-full rounded bg-red-600" />
          <div class="mt-2 text-xs text-gray-700 dark:text-gray-300">Danger: <code class="font-mono">bg-red-600 text-white</code></div>
        </div>
        <div class="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="h-12 w-full rounded bg-gray-900" />
          <div class="mt-2 text-xs text-gray-700 dark:text-gray-300">Dark: <code class="font-mono">bg-gray-900 text-white</code></div>
        </div>
      </div>
      <div class="mt-4 text-xs text-gray-700 dark:text-gray-300">Neutrals: <code class="font-mono">text-gray-900, text-gray-600, border-gray-200, dark:bg-gray-800</code></div>
    </section>

    <!-- Typography -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Font Hierarchy</h2>
      <p class="text-xs text-gray-600 dark:text-gray-300 mb-4">Tailwind config uses <code class="font-mono">font-heading</code> and <code class="font-mono">font-sans</code> (Nunito). Sizes below align with app usage.</p>
      <div class="space-y-2">
        <div class="font-heading text-2xl text-gray-900 dark:text-white">Heading XL <code class="font-mono text-xs">font-heading text-2xl</code></div>
        <div class="font-heading text-xl text-gray-900 dark:text-white">Heading L <code class="font-mono text-xs">font-heading text-xl</code></div>
        <div class="font-heading text-lg text-gray-900 dark:text-white">Heading M <code class="font-mono text-xs">font-heading text-lg</code></div>
        <div class="text-base text-gray-900 dark:text-white">Body <code class="font-mono text-xs">text-base</code></div>
        <div class="text-sm text-gray-700 dark:text-gray-300">Secondary <code class="font-mono text-xs">text-sm text-gray-700</code></div>
        <div class="text-xs text-gray-500">Caption <code class="font-mono text-xs">text-xs text-gray-500</code></div>
      </div>
    </section>

    <!-- Buttons -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Buttons</h2>
      <div class="flex flex-wrap gap-3 items-center">
        <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Primary</button>
        <button class="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg">Dark</button>
        <button class="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-sm rounded-lg text-gray-700">Secondary</button>
        <button class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg">Success</button>
        <button class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg">Danger</button>
      </div>
      <div class="mt-4">
        <pre class="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto"><code>&lt;button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"&gt;Primary&lt;/button&gt;</code></pre>
      </div>
    </section>

    <!-- Pills / Badges -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Pills / Badges</h2>
      <div class="flex flex-wrap gap-2 items-center">
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">Info</span>
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">Active</span>
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">Warning</span>
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">Error</span>
      </div>
      <div class="mt-4">
        <pre class="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto"><code>&lt;span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700"&gt;Active&lt;/span&gt;</code></pre>
      </div>
    </section>

    <!-- Form Fields -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Form Fields</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text input</label>
          <input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Placeholder" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select</label>
          <select class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option>Option A</option>
            <option>Option B</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Textarea</label>
          <textarea rows="3" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Write something…"></textarea>
        </div>
      </div>
      <div class="mt-4">
        <pre class="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto"><code>&lt;input class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" /&gt;</code></pre>
      </div>
    </section>

    <!-- Cards / Containers -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Cards / Containers</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          <div class="text-sm text-gray-900 dark:text-gray-100">Default card</div>
        </div>
        <div class="rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-sm text-gray-900 dark:text-gray-100">Muted card</div>
        </div>
        <div class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-lg">
          <div class="text-sm text-gray-900 dark:text-gray-100">Elevated card</div>
        </div>
      </div>
      <div class="mt-4">
        <pre class="bg-gray-50 dark:bg-gray-900 rounded p-3 text-xs overflow-auto"><code>&lt;div class="rounded-lg bg-white border border-gray-200 p-4 shadow-sm"&gt;...&lt;/div&gt;</code></pre>
      </div>
    </section>

    <!-- Utilities -->
    <section class="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Useful Utilities</h2>
      <ul class="text-sm text-gray-700 dark:text-gray-300 list-disc pl-5 space-y-1">
        <li><code class="font-mono">flex items-center gap-2</code> — Align with spacing</li>
        <li><code class="font-mono">rounded-lg border border-gray-200 dark:border-gray-700</code> — Consistent container</li>
        <li><code class="font-mono">text-gray-900 dark:text-white</code> — Light/dark text</li>
        <li><code class="font-mono">focus:ring-2 focus:ring-blue-500</code> — Accessible focus ring</li>
        <li><code class="font-mono">shadow-sm shadow-black/10</code> — Subtle shadow</li>
      </ul>
    </section>
  </div>
</template>

<script setup>
// No logic needed; static examples only
</script>
