import pandas as pd
import torch


def preprocess(df: pd.DataFrame, context_length: int, timestamp_col: str= "date", target_col: str = "sales"):
    df = df.sort_values(timestamp_col)
    values = torch.tensor(df[target_col].values, dtype=torch.float).flatten()

    if len(values) >= context_length:
        values = values[-context_length:]
    else:
        pad_len = context_length - len(values)
        # Use edge-value padding instead of zeros so short histories do not get flattened.
        edge_value = values[0] if len(values) > 0 else torch.tensor(0.0, dtype=torch.float)
        pad_values = torch.full((pad_len,), float(edge_value), dtype=torch.float)
        values = torch.cat((pad_values, values), dim=0)

    past_values = values.unsqueeze(0).unsqueeze(-1)
    freq_token = torch.tensor([0])
    processed = {"past_values": past_values, "freq_token": freq_token}

    return processed
