import pandas as pd
import torch


def preprocess(df: pd.DataFrame, context_length: int, timestamp_col: str= "date", target_col: str = "sales"):
    df = df.sort_values(timestamp_col)
    values = torch.tensor(df[target_col].values, dtype=torch.float).flatten()

    if len(values) >= context_length:
        values = values[-context_length:]
    else:

        pad_len = context_length - len(values)
        values = torch.cat((torch.zeros(pad_len, dtype = torch.float), values), dim = 0)

    past_values = values.unsqueeze(0).unsqueeze(-1)
    freq_token = torch.tensor([0])
    processed = {"past_values": past_values, "freq_token": freq_token}

    return processed
