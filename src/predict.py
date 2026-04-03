import torch


def forecast(model, processed):
    model.eval()

    if isinstance(processed, str):
        raise ValueError("processed is string, should be dict")

    with torch.no_grad():
        output = model(**processed)

    preds = output[0].squeeze().tolist()

    preds = [int(round(p)) for p in preds]

    return preds
