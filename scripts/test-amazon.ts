import { searchAmazon, closeBrowser } from "./scrapers/amazon.ts";

async function test() {
  console.log("Testing Amazon scraper...");
  try {
    const results = await searchAmazon("Sennheiser HD800S headphones", {
      maxResults: 5,
      affiliateTag: "lecrampeq-20",
    });
    console.log(`Found ${results.length} results:`);
    for (const r of results) {
      console.log(
        `  ASIN: ${r.asin} | $${r.price} | ${r.inStock ? "In Stock" : "OOS"} | ${r.name.substring(0, 80)}`
      );
      console.log(`    URL: ${r.url}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
  await closeBrowser();
  process.exit(0);
}

test();
