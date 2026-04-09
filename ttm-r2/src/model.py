from tsfm_public.toolkit.get_model import get_model


def load_model(model_name: str, context_length: int, prediction_length: int, freq: str):
    model = get_model(
        model_path=model_name,
        context_length=context_length,
        prediction_length=prediction_length,
        freq=freq,
        model_name="ttm",
        prefer_l1_loss=True,
    )
    return model
