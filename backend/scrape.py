
import asyncio
import csv
from pathlib import Path
from playwright.async_api import async_playwright

OUTPUT_FILE = Path(__file__).resolve().parent / "flipkart_reviews.csv"
MAX_SCROLLS = 60


def Url(product_url):
    if "/p/" in product_url and "/product-reviews/" not in product_url:
        product_url = product_url.replace("/p/", "/product-reviews/")
    return product_url


async def scrape_reviews(url):
    reviews = {}
    tasks = set()

    def find_reviews(obj):
        if isinstance(obj, dict):
            if obj.get("type") == "ProductReviewValue":
                record = {
                    "review_id": obj.get("id"),
                    "name": obj.get("author"),
                    "date": obj.get("created"),
                    "location": obj.get("location"),
                    "rating": obj.get("rating"),
                    "title": obj.get("title"),
                    "text": obj.get("text"),
                }

                key = record["review_id"] or (
                    record["name"],
                    record["date"],
                    record["rating"],
                    record["title"],
                    record["text"]
                )

                reviews[key] = record

            for value in obj.values():
                find_reviews(value)

        elif isinstance(obj, list):
            for value in obj:
                find_reviews(value)

    async def process_response(response):
        try:
            data = await response.json()
            find_reviews(data)
        except Exception:
            pass

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        try:
            page = await browser.new_page(
                viewport={"width": 1365, "height": 900}
            )

            def on_response(response):
                if "fetch?cacheFirst=false" in response.url:
                    task = asyncio.create_task(
                        process_response(response)
                    )
                    tasks.add(task)
                    task.add_done_callback(tasks.discard)

            page.on("response", on_response)

            print("Opening:", url)

            await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=60000
            )

            await page.wait_for_timeout(4000)

            print("Page title:", await page.title())

            unchanged = 0
            previous_height = -1
            previous_reviews = -1

            for step in range(1, MAX_SCROLLS + 1):
                await page.mouse.move(1000, 700)
                await page.mouse.wheel(0, 650)
                await page.wait_for_timeout(900)

                if tasks:
                    await asyncio.gather(
                        *list(tasks),
                        return_exceptions=True
                    )

                height = await page.evaluate(
                    "document.documentElement.scrollHeight"
                )

                if (
                    height == previous_height
                    and len(reviews) == previous_reviews
                ):
                    unchanged += 1
                else:
                    unchanged = 0

                previous_height = height
                previous_reviews = len(reviews)

                print(
                    f"Step {step}: "
                    f"reviews={len(reviews)}, height={height}"
                )

                if unchanged >= 8:
                    break

            if tasks:
                await asyncio.gather(
                    *list(tasks),
                    return_exceptions=True
                )

        finally:
            await browser.close()

    review_list = list(reviews.values())

    # Save extracted reviews to CSV
    fields = [
        "review_id",
        "name",
        "date",
        "location",
        "rating",
        "title",
        "text"
    ]

    with open(
        OUTPUT_FILE,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(review_list)

    print(f"Extracted {len(review_list)} unique reviews.")
    print(f"Saved to {OUTPUT_FILE}")

    # Return reviews to Flask
    return review_list


# Keep standalone scraper functionality
if __name__ == "__main__":
    product_url = input("Enter Product URL: ").strip()

    if product_url:
        result = asyncio.run(
            scrape_reviews(Url(product_url))
        )
        print("Total reviews:", len(result))
    else:
        print("No URL entered.")
