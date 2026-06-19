import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// --- ADVANCED IN-MEMORY CACHE ---
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// The "Lock" that prevents double-fetching
let activeFetchPromise: Promise<any> | null = null; 

export async function GET() {
    const CA = "UWUy7J86LUiBv5SjAUZ53LMGhtnqvbQ7QNSSkyupump";
    const currentTime = Date.now();

    // 1. Check if we have fresh data in the cache
    if (cachedData && (currentTime - cacheTimestamp) < CACHE_DURATION_MS) {
        console.log("🟢 Serving chart data from Server Cache!");
        return json(cachedData);
    }

    // 2. PROMISE LOCK: If we are ALREADY asking Birdeye, just wait for that answer!
    if (activeFetchPromise) {
        console.log("⏳ Request is waiting for an active Birdeye fetch to finish...");
        const sharedData = await activeFetchPromise;
        return json(sharedData);
    }

    // 3. If no cache and no active fetch, we must be the first request. Lock it!
    const toTime = Math.floor(currentTime / 1000);
    const fromTime = toTime - (14 * 4 * 3600); 

    // Clean up the API key (removes spaces, \n, or accidental quotes from the .env file)
    const rawKey = env.BIRDEYE_API_KEY || "";
    const cleanApiKey = rawKey.replace(/['"]/g, '').trim();

    console.log("🟡 Fetching fresh chart data from Birdeye...");

    // Store the fetch promise in our lock variable
    activeFetchPromise = fetch(`https://public-api.birdeye.so/defi/ohlcv?address=${CA}&type=4H&time_from=${fromTime}&time_to=${toTime}`, {
        headers: {
            "X-API-KEY": cleanApiKey, 
            "x-chain": "solana"
        }
    }).then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
            console.error("🚨 Birdeye API Rejected Request:", data);
            return { error: "API rejected request", details: data, status: response.status };
        }

        // Save to cache
        cachedData = data;
        cacheTimestamp = Date.now();
        return data;

    }).catch((error) => {
        console.error("🚨 Server fetch error:", error);
        return { error: "Failed to fetch data", status: 500 };
    }).finally(() => {
        // Unlock the promise so future requests can happen if the cache expires
        activeFetchPromise = null; 
    });

    // Wait for our own locked fetch to finish and return it
    const finalData = await activeFetchPromise;
    
    if (finalData.error) {
        return json(finalData, { status: finalData.status });
    }
    
    return json(finalData);
}