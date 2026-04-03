from datetime import timedelta

from flask import Flask, request, jsonify
import pandas as pd
from src.data import preprocess
from src.model import load_model
from src.predict import forecast

app = Flask(__name__)

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
        prediction_length = int(request.form.get("prediction_length", 7))
        if prediction_length not in MODELS:
            return jsonify(
                {
                    "error": "Invalid prediction_length. Supported values are 7 and 30."
                }
            )

        if file.filename == "":
            return jsonify({"error": "Empty filename"})

        df = pd.read_csv(file)
        df["date"] = pd.to_datetime(df["date"], dayfirst=True, format="mixed")
        selected_model = MODELS[prediction_length]
        selected_config = MODEL_CONFIGS[prediction_length]
        processed = preprocess(df, context_length=selected_config["context_length"])
        preds = forecast(selected_model, processed=processed)
        last_date = df["date"].max()
        future_dates = [
            (last_date + timedelta(days=i + 1)).strftime("%Y-%m-%d")
            for i in range(len(preds))
        ]

        result = [{"date": d, "sales": v} for d, v in zip(future_dates, preds)]

        return jsonify(
            {
                "status": "success",
                "forecast": result,
                "previous": [
                    {"date": row["date"].strftime("%Y-%m-%d"), "sales": row["sales"]}
                    for _, row in df.iterrows()
                ],
            }
        )

    except Exception as e:
        print("===>", e)
        return jsonify({"error": str(e)})


if __name__ == "__main__":
    app.run(debug=True)
