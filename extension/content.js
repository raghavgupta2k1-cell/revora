
// REVORA - Flipkart content script

// Prevent duplicate script execution
if (!window.__REVORA_CONTENT_SCRIPT_LOADED__) {
    window.__REVORA_CONTENT_SCRIPT_LOADED__ = true;

    function extractFlipkartReviews() {
        const reviews = [];
        const seen = new Set();

        const reviewElements = document.querySelectorAll(
            "div[data-id], div.col._2wzgFH, div._27M-vq"
        );

        reviewElements.forEach((element) => {
            const textElement = element.querySelector(
                "div.t-ZTKy, div._6K-7Co"
            );

            const ratingElement = element.querySelector(
                "div._3LWZlK, div.XQDdHH"
            );

            const titleElement = element.querySelector(
                "p._2-N8zT, p.z9E0IG"
            );

            if (!textElement || !ratingElement) return;

            const text = textElement.innerText.trim();
            const rating = parseFloat(ratingElement.innerText.trim());
            const title = titleElement
                ? titleElement.innerText.trim()
                : "";

            if (!text || !Number.isFinite(rating)) return;

            const key = `${rating}-${title}-${text}`;

            if (seen.has(key)) return;

            seen.add(key);
            reviews.push({ title, text, rating });
        });

        return reviews;
    }

    chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => {
            if (message.action === "REVORA_EXTRACT_REVIEWS") {
                const reviews = extractFlipkartReviews();

                sendResponse({
                    success: true,
                    count: reviews.length,
                    reviews: reviews
                });
            }
        }
    );
}
