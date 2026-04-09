from datetime import timedelta
from flask import Flask, request, jsonify
import pandas as pd
from src.data import preprocess
from src.model import load_model
from src.predict import forecast

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return response

MODEL_NAME = "ibm-granite/granite-timeseries-ttm-r2"
FREQ = "D"

MODEL_CONFIGS = {
    7: {
        "model_name": MODEL_NAME,
        "context_length": 365,
        "prediction_length": 7,
        "freq": FREQ,
    },
    30: {
        "model_name": MODEL_NAME,
        "context_length": 365,
        "prediction_length": 30,
        "freq": FREQ,
    },
}

print("Loading models")
MODELS = {
    prediction_length: load_model(**config)
    for prediction_length, config in MODEL_CONFIGS.items()
}


@app.route("/")
def home():
    return "API Running "


@app.route("/predict", methods=["POST"])
def predict_api():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"})

        file = request.files["file"]
        product_name = (request.form.get("product_name") or "").strip()
        product_category = (request.form.get("product_category") or "").strip()
        market_type = (request.form.get("market_type") or "").strip()

        def parse_money(key: str) -> float:
            raw = request.form.get(key)
            try:
                return float(raw)
            except (TypeError, ValueError):
                return 0.0

        cost_price = parse_money("cost_price")
        sell_price = parse_money("sell_price")

        if file.filename == "":
            return jsonify({"error": "Empty filename"})

        df = pd.read_csv(file)
        df["date"] = pd.to_datetime(df["date"], dayfirst=True, format="mixed")
        df["sales"] = pd.to_numeric(df["sales"], errors="coerce").fillna(0)
        previous = [
            {"date": row["date"].strftime("%Y-%m-%d"), "sales": float(row["sales"])}
            for _, row in df.iterrows()
        ]
        df_sorted = df.sort_values("date")
        last_date = df_sorted["date"].max()

        def compute_one_horizon(pred_len: int):
            model = MODELS[pred_len]
            config = MODEL_CONFIGS[pred_len]
            processed = preprocess(df_sorted, context_length=config["context_length"])
            preds = forecast(
                model,
                processed=processed,
                history_values=df_sorted["sales"].tolist(),
            )

            future_dates = [
                (last_date + timedelta(days=i + 1)).strftime("%Y-%m-%d")
                for i in range(len(preds))
            ]

            forecast_sales = float(sum(preds))
            previous_window_sales = float(df_sorted["sales"].tail(pred_len).sum())

            if previous_window_sales != 0:
                growth_percent = (
                    (forecast_sales - previous_window_sales) / previous_window_sales
                ) * 100.0
            else:
                growth_percent = 0.0 if forecast_sales == 0 else 100.0

            forecast_revenue = forecast_sales * sell_price

            enriched_forecast = []
            for d, s in zip(future_dates, preds):
                sales = float(s)
                revenue = sales * sell_price
                cost = sales * cost_price
                profit = revenue - cost
                enriched_forecast.append(
                    {
                        "date": d,
                        "sales": sales,
                        "revenue": round(revenue, 2),
                        "cost": round(cost, 2),
                        "profit": round(profit, 2),
                    }
                )

            # Confidence heuristic: more history -> higher confidence (bounded 55..95).
            history_strength = min(1.0, len(df_sorted) / max(1, config["context_length"]))
            confidence = round(55 + (40 * history_strength))

            return {
                "predictionLength": pred_len,
                "summary": {
                    "previousWindowSales": round(previous_window_sales, 2),
                    "forecastSales": round(forecast_sales, 2),
                    "growthPercent": round(growth_percent, 2),
                    "confidence": confidence,
                    "forecastRevenue": round(forecast_revenue, 2),
                },
                "forecast": enriched_forecast,
            }

        return jsonify(
            {
                "status": "success",
                "product": {
                    "name": product_name,
                    "category": product_category,
                    "marketType": market_type,
                },
                "pricing": {
                    "costPrice": round(float(cost_price), 2),
                    "sellPrice": round(float(sell_price), 2),
                    "currency": "",
                },
                "previous": previous,
                "forecasts": {
                    "week": compute_one_horizon(7),
                    "month": compute_one_horizon(30),
                },
            }
        )

    except Exception as e:
        print("===>", e)
        return jsonify({"error": str(e)})


if __name__ == "__main__":
    app.run(debug=True)
