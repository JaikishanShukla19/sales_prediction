import torch

def forecast(model, processed, history_values=None, volatility_scale: float = 0.55):
    model.eval()

    if isinstance(processed, str):
        raise ValueError("processed is string, should be dict")

    with torch.no_grad():
        output = model(**processed)

    raw_preds = output[0].squeeze().tolist()
    preds = [float(p) for p in raw_preds] if isinstance(raw_preds, list) else [float(raw_preds)]

    # Make predictions respond more to recent volatility in history.
    if history_values is not None and len(history_values) >= 4 and len(preds) > 1:
        history = [float(v) for v in history_values if v is not None]
        if len(history) >= 4:
            recent_window = history[-max(14, len(preds) + 2) :]
            deltas = [
                recent_window[i] - recent_window[i - 1]
                for i in range(1, len(recent_window))
            ]
            if deltas:
                mean_pred = sum(preds) / len(preds)
                mean_abs_delta = sum(abs(d) for d in deltas) / len(deltas)
                avg_level = max(1.0, sum(abs(v) for v in recent_window) / len(recent_window))
                relative_vol = min(0.8, mean_abs_delta / avg_level)
                stretch_factor = 1.0 + (relative_vol * volatility_scale)

                cyclical_deltas = [deltas[i % len(deltas)] for i in range(len(preds))]
                adjusted = []
                for idx, pred in enumerate(preds):
                    stretched = mean_pred + ((pred - mean_pred) * stretch_factor)
                    volatility_push = cyclical_deltas[idx] * (volatility_scale * 0.45)
                    adjusted.append(max(0.0, stretched + volatility_push))
                preds = adjusted

    preds = [int(round(max(0.0, p))) for p in preds]

    return preds
