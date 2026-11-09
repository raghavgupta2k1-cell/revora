
import asyncio
from pathlib import Path
from urllib.parse import urlparse

import joblib
import pandas as pd

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

from scrape import Url, scrape_reviews


# =====================================
# REVORA FLASK APPLICATION
# =====================================

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "fake_review_model.joblib"
CSV_PATH = BASE_DIR / "review_predictions.csv"


# =====================================
# LOAD ML MODEL
# =====================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

model = joblib.load(MODEL_PATH)

print("REVORA ML Model loaded successfully!")


# =====================================
# HOME
# =====================================

@app.route("/", methods=["GET"])
def home():
    return """
    <html>
        <body style="font-family:Arial;text-align:center;padding:50px">
            <h1>REVORA</h1>
            <h2>Fake Review Detection System</h2>
            <p>REVORA Backend is Working Successfully!</p>
            <p>ML Model Loaded Successfully.</p>
            <a href="/health">Check Backend Health</a>
        </body>
    </html>
    """


# =====================================
# HEALTH CHECK
# =====================================

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "success",
        "message": "REVORA backend is running",
        "model_loaded": True
    })


# =====================================
# VALIDATE FLIPKART URL
# =====================================

def validate_product_url(product_url):

    parsed = urlparse(product_url)

    hostname = (parsed.hostname or "").lower()

    if (
        parsed.scheme != "https"
        or not (
            hostname == "flipkart.com"
            or hostname.endswith(".flipkart.com")
        )
    ):
        raise ValueError("Please provide a valid Flipkart product URL.")

    return Url(product_url)


# =====================================
# ANALYZE REVIEWS
# =====================================

@app.route("/analyze", methods=["POST"])
def analyze():

    try:
        data = request.get_json(silent=True) or {}

        # OPTION 1: Scrape reviews using Playwright
        product_url = data.get("product_url")

        if product_url:

            print("\nREVORA: Starting Playwright scraper...")

            product_url = validate_product_url(
                str(product_url).strip()
            )

            scraped_reviews = asyncio.run(
                scrape_reviews(product_url)
            )

            print(
                f"REVORA: Scraper collected "
                f"{len(scraped_reviews)} reviews."
            )

            reviews = scraped_reviews

        # OPTION 2: Accept reviews directly
        else:
            reviews = data.get("reviews", [])

        if not isinstance(reviews, list) or not reviews:
            return jsonify({
                "status": "error",
                "error": "No reviews were extracted or received."
            }), 400

        results = []

        # Prepare reviews
        for review in reviews:

            if not isinstance(review, dict):
                continue

            text = str(
                review.get("text")
                or review.get("review_text")
                or ""
            ).strip()

            title = str(review.get("title") or "").strip()

            try:
                rating = float(review.get("rating"))
            except (TypeError, ValueError):
                rating = None

            results.append({
                "name": review.get("name", ""),
                "date": review.get("date", ""),
                "title": title,
                "text": text,
                "rating": rating,
                "prediction": "Not evaluated",
                "confidence": None
            })

        if not results:
            return jsonify({
                "status": "error",
                "error": "No valid review objects found."
            }), 400

        # Find reviews suitable for ML prediction
        valid_indices = [
            i for i, review in enumerate(results)
            if (
                review["text"]
                and review["rating"] is not None
                and 1 <= review["rating"] <= 5
            )
        ]

        # Run ML model
        if valid_indices:

            model_data = pd.DataFrame([
                {
                    "review_text": results[i]["text"],
                    "rating": results[i]["rating"]
                }
                for i in valid_indices
            ])

            predictions = model.predict(model_data)
            probabilities = model.predict_proba(model_data)

            classes = list(model.classes_)

            genuine_index = classes.index(0)
            fake_index = classes.index(1)

            for position, original_index in enumerate(valid_indices):

                prediction = int(predictions[position])

                if prediction == 0:
                    label = "OR (Genuine)"
                    confidence = (
                        probabilities[position][genuine_index] * 100
                    )
                else:
                    label = "CG (Fake)"
                    confidence = (
                        probabilities[position][fake_index] * 100
                    )

                results[original_index]["prediction"] = label
                results[original_index]["confidence"] = round(
                    float(confidence), 2
                )

        # Calculate summary
        evaluated = [
            r for r in results
            if r["prediction"] != "Not evaluated"
        ]

        genuine_count = sum(
            r["prediction"] == "OR (Genuine)"
            for r in evaluated
        )

        fake_count = sum(
            r["prediction"] == "CG (Fake)"
            for r in evaluated
        )

        total = len(results)
        evaluated_count = len(evaluated)

        # Save CSV
        pd.DataFrame(results).to_csv(
            CSV_PATH,
            index=False,
            encoding="utf-8-sig"
        )

        print("REVORA: Analysis completed!")

        return jsonify({
            "status": "success",
            "summary": {
                "total": total,
                "evaluated": evaluated_count,
                "not_evaluated": total - evaluated_count,
                "genuine": genuine_count,
                "fake": fake_count,
                "genuine_percentage": round(
                    genuine_count / evaluated_count * 100, 2
                ) if evaluated_count else 0,
                "fake_percentage": round(
                    fake_count / evaluated_count * 100, 2
                ) if evaluated_count else 0
            },
            "reviews": results
        })

    except Exception as e:

        app.logger.exception("REVORA analysis failed")

        return jsonify({
            "status": "error",
            "error": str(e),
            "message": str(e)
        }), 500


# =====================================
# DOWNLOAD CSV
# =====================================

@app.route("/download", methods=["GET"])
def download():

    if not CSV_PATH.exists():
        return jsonify({
            "status": "error",
            "message": "No analysis results available yet."
        }), 404

    return send_file(
        CSV_PATH,
        as_attachment=True,
        download_name="REVORA_review_predictions.csv"
    )


# =====================================
# RUN SERVER
# =====================================

if __name__ == "__main__":

    print("Starting REVORA Backend...")

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
        use_reloader=False
    )
