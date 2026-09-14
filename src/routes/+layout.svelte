<script lang="ts">
    import "../app.css";
    import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";
    import { dev } from "$app/environment";
    import { injectAnalytics } from "@vercel/analytics/sveltekit";

    let { children } = $props();

    injectAnalytics({ mode: dev ? "development" : "production" });

    injectSpeedInsights();
</script>

{@render children()}
