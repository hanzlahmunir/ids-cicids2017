# demo_assets

The demo backend loads the trained model + held-out test data from this folder.
The large files are **not committed** (they're reproducible from the Kaggle
notebooks). Download them and drop them here before running the demo:

| File | Source notebook (Kaggle output) | Size |
|---|---|---|
| `xgb_multi_best.json`     | `09_Modeling_Comparison` | ~9 MB |
| `test_selected.parquet`   | `04_FeatureSelection`    | ~49 MB |
| `comparison_metrics.json` | `09_Modeling_Comparison` | tiny (optional) |
| `label_mapping.csv`       | committed here already   | tiny |

`feature_list.json` is **not** required — the backend derives the 47 feature
names (and their order) directly from `test_selected.parquet`.

Once these are in place, follow `../README.md` to run the backend + frontend.
