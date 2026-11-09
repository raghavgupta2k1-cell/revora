
const API_URL = "http://127.0.0.1:5000";

// =====================================
// HTML ELEMENTS
// =====================================

const analyzeBtn = document.getElementById("analyzeBtn");
const pageStatus = document.getElementById("pageStatus");
const statusMessage = document.getElementById("statusMessage");
const results = document.getElementById("results");

const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");


// =====================================
// STATUS MESSAGE
// =====================================

function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.color = isError ? "#f87171" : "#91a2bf";
}


// =====================================
// GET PRODUCT NAME
// =====================================

async function updateProductName() {
    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        const tab = tabs[0];

        if (
            !tab ||
            !tab.url ||
            !tab.url.startsWith("https://www.flipkart.com/")
        ) {
            pageStatus.textContent = "Open a Flipkart product page";
            return;
        }

        let productName = tab.title || "Flipkart Product";

        productName = productName
            .replace(/\s*[-|]\s*Buy.*$/i, "")
            .replace(/\s*[-|]\s*Flipkart.*$/i, "")
            .trim();

        pageStatus.textContent = productName || "Flipkart Product";

    } catch (error) {
        console.error("Product detection error:", error);
        pageStatus.textContent = "Product not detected";
    }
}


// =====================================
// CHECK BACKEND CONNECTION
// =====================================

async function checkBackend() {
    try {
        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
            throw new Error("Backend connection failed");
        }

        connectionDot.className = "status-dot connected";
        connectionText.textContent = "Connected";

        showStatus("REVORA is ready to analyze reviews.");

    } catch (error) {
        connectionDot.className = "status-dot disconnected";
        connectionText.textContent = "Disconnected";

        showStatus(
            "Please start your Flask backend.",
            true
        );
    }
}


// =====================================
// FORMAT PERCENTAGE
// =====================================

function getPercentage(value) {
    const number = Number(value) || 0;
    return `${number.toFixed(1)}%`;
}


// =====================================
// DISPLAY ANALYSIS RESULTS
// =====================================

function displayResults(data) {

    results.hidden = false;

    const summary = data.summary || {};
    const reviews = data.reviews || [];

    const evaluated = Number(summary.evaluated ?? reviews.length);
    const genuine = Number(summary.genuine ?? 0);
    const fake = Number(summary.fake ?? 0);

    const genuinePercent = Number(
        summary.genuine_percentage ??
        (evaluated ? genuine / evaluated * 100 : 0)
    );

    const fakePercent = Number(
        summary.fake_percentage ??
        (evaluated ? fake / evaluated * 100 : 0)
    );


    // =====================================
    // GENUINE REVIEWS
    // =====================================

    document.getElementById("genuinePercent").textContent =
        getPercentage(genuinePercent);

    document.getElementById("genuineCount").textContent =
        `${genuine} Genuine Reviews`;


    // =====================================
    // FAKE REVIEWS
    // =====================================

    document.getElementById("fakePercent").textContent =
        getPercentage(fakePercent);

    document.getElementById("fakeCount").textContent =
        `${fake} Fake Reviews`;


    // =====================================
    // TOTAL REVIEWS
    // =====================================

    document.getElementById("totalReviews").textContent =
        evaluated;


    // =====================================
    // PROGRESS BAR
    // =====================================

    document.getElementById("genuineBar").style.width =
        `${Math.max(0, Math.min(100, genuinePercent))}%`;

    document.getElementById("fakeBar").style.width =
        `${Math.max(0, Math.min(100, fakePercent))}%`;

    document.getElementById("genuineLegend").textContent =
        `${getPercentage(genuinePercent)} Genuine`;

    document.getElementById("fakeLegend").textContent =
        `${getPercentage(fakePercent)} Fake`;


    // =====================================
    // INDIVIDUAL REVIEW PREDICTIONS
    // =====================================

    const reviewList = document.getElementById("reviewList");

    reviewList.replaceChildren();

    if (reviews.length === 0) {

        const emptyMessage = document.createElement("p");

        emptyMessage.textContent =
            "No individual review results available.";

        emptyMessage.style.color = "#91a2bf";

        reviewList.appendChild(emptyMessage);
    }


    reviews.forEach((review, index) => {

        const card = document.createElement("div");
        card.className = "review-card";


        // REVIEW TITLE

        const title = document.createElement("div");

        title.className = "review-title";

        title.textContent =
            review.title || `Review ${index + 1}`;


        // REVIEW TEXT

        const reviewText = document.createElement("div");

        reviewText.className = "review-text";

        reviewText.textContent =
            review.text ||
            review.review_text ||
            "No review text available.";


        // PREDICTION

        const prediction = String(
            review.prediction || "Not evaluated"
        );

        const normalized = prediction.toLowerCase();

        const isFake =
            normalized.includes("fake") ||
            normalized.includes("cg");

        const isGenuine =
            normalized.includes("genuine") ||
            normalized.includes("or");

        const label = document.createElement("span");

        label.className =
            "review-label " +
            (isFake ? "fake" : isGenuine ? "genuine" : "neutral");

        label.textContent = `Prediction: ${prediction}`;

        card.append(title, reviewText, label);


        // =====================================
        // RATING
        // =====================================

        if (
            review.rating !== null &&
            review.rating !== undefined
        ) {

            const rating = document.createElement("div");

            rating.className = "review-meta";

            rating.textContent =
                `Rating: ${review.rating}/5`;

            card.appendChild(rating);
        }


        // =====================================
        // CONFIDENCE
        // =====================================

        if (
            review.confidence !== null &&
            review.confidence !== undefined
        ) {

            const confidence = Number(review.confidence);

            const confidenceValue = confidence <= 1
                ? confidence * 100
                : confidence;

            const confidenceText = document.createElement("div");

            confidenceText.className = "review-meta";

            confidenceText.textContent =
                `Confidence: ${confidenceValue.toFixed(1)}%`;

            card.appendChild(confidenceText);
        }

        reviewList.appendChild(card);
    });
}


// =====================================
// DOWNLOAD CSV REPORT
// =====================================

document.getElementById("downloadBtn").addEventListener("click", () => {

    window.open(
        `${API_URL}/download`,
        "_blank"
    );

});


// =====================================
// ANALYZE REVIEWS
// =====================================

analyzeBtn.addEventListener("click", async () => {

    try {

        analyzeBtn.disabled = true;

        analyzeBtn.textContent = "Scraping Reviews...";

        results.hidden = true;

        showStatus("Checking Flipkart product page...");


        // GET ACTIVE TAB

        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        const tab = tabs[0];


        // VALIDATE FLIPKART PAGE

        if (
            !tab ||
            !tab.url ||
            !tab.url.startsWith("https://www.flipkart.com/")
        ) {

            throw new Error(
                "Please open a Flipkart product page first."
            );
        }


        // UPDATE PRODUCT NAME

        await updateProductName();


        // SEND PRODUCT URL TO BACKEND

        showStatus(
            "Sending product URL to Playwright scraper..."
        );

        analyzeBtn.textContent = "Scraping and Analyzing...";


        const response = await fetch(
            `${API_URL}/analyze`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    product_url: tab.url
                })
            }
        );


        // READ BACKEND RESPONSE

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error ||
                data.message ||
                "Backend analysis failed."
            );
        }


        // DISPLAY RESULTS

        displayResults(data);


        // SUCCESS MESSAGE

        showStatus(
            `Analysis completed! ${data.summary.evaluated} reviews evaluated.`
        );


    } catch (error) {

        console.error("REVORA Error:", error);

        showStatus(
            error.message || "Something went wrong.",
            true
        );

    } finally {

        analyzeBtn.disabled = false;

        analyzeBtn.textContent = "Analyze Reviews";

    }

});


// =====================================
// INITIALIZE REVORA
// =====================================

updateProductName();

checkBackend();

