# Intrusion Detection on CICIDS-2017

End-to-end machine-learning pipeline for network intrusion detection on the
**CICIDS-2017** benchmark — from raw flow CSVs through cleaning, feature
engineering, dimensionality reduction, and modelling. Both **binary**
(BENIGN vs ATTACK) and **multi-class** (7 attack families) classification.

Two of the models are implemented **from scratch in NumPy** (no
`sklearn.linear_model`): binary logistic regression with mini-batch gradient
descent, and multi-class softmax regression.

---

## Pipeline at a glance

```
Raw CSVs (2.83M rows, 79 features, 15 classes)
        │
        ▼
01  EDA                     —  data shape, missing, dupes, skew, correlations
        │
        ▼
02  Preprocessing           —  -256k duplicates, fix Inf/NaN, drop zero-var,
                                drop |r|>0.95 redundancy, sentinel-aware
                                negative handling, group 15 → 7 attack families,
                                stratified 80/20 train/test split
        │
        ▼
03  Feature Engineering     —  log1p on highly-skewed features, +7 derived
                                ratio / rate features, StandardScaler
                                (fit on train only)
        │
        ▼
04  Feature Selection       —  Pearson + Spearman + Mutual Information vs both
                                targets, inter-feature correlation pruning,
                                SMOTE for binary AND multi-class on the
                                selected feature space
        │
        ▼
05  Binary Modelling        —  Logistic Regression from scratch + grid search
                                + SMOTE vs class-weighting head-to-head
        │
        ▼
06  Multi-class Modelling   —  Softmax Regression from scratch + grid search
                                + SMOTE vs class-weighting (macro-F1)
```

Numbers along the way:

| Stage | Rows | Features |
|---|---:|---:|
| Raw | 2,830,743 | 79 |
| After preprocessing | 2,574,264 | 49 |
| Train split (80%) | 2,059,411 | 49 |
| After feature engineering | 2,059,411 | 58 |
| After feature selection | 2,059,411 | 47 |
| Binary SMOTE train | 3,437,418 | 47 |
| Multi-class SMOTE train | 2,918,709 | 47 |

---

## Repository layout

```
ids-cicids2017/
├── notebooks/                      ← clean re-runnable templates
│   ├── 01_EDA.ipynb
│   ├── 02_Preprocessing.ipynb
│   ├── 03_FeatureEngineering.ipynb
│   ├── 04_FeatureSelection.ipynb
│   ├── 05_Modeling_Binary.ipynb
│   └── 06_Modeling_Multiclass.ipynb
└── outputs/                        ← rendered runs with embedded figures
    ├── 01_EDA_outputs.ipynb
    ├── 02_Preprocessing_outputs.ipynb
    ├── 03_FeatureEngineering_outputs.ipynb
    ├── 04_FeatureSelection_outputs.ipynb
    └── 05_Modeling_Binary_outputs.ipynb
```

The dataset itself is **not** in this repository — download it from the
Canadian Institute for Cybersecurity:
<https://www.unb.ca/cic/datasets/ids-2017.html>

---

## Headline results

### Binary task — Logistic Regression from scratch

| Strategy | Test F1 | ROC-AUC | Precision | Recall |
|---|---:|---:|---:|---:|
| Class weighting | **0.9052** | 0.9932 | 0.8501 | 0.9680 |
| SMOTE | 0.9051 | 0.9933 | 0.8493 | 0.9687 |

Class weighting and SMOTE are **statistically tied** at ~5:1 imbalance. The
class-weighting model is chosen — same metrics, simpler artifact, faster
training (no 394 MB SMOTE file).

Best hyperparameters from grid search: `lr=0.5, λ=0.0, batch_size=4096`,
60 epochs. The strongest learned signal for ATTACK was `has_init_win_fwd`
— the Init-Win sentinel flag added during preprocessing.

### Multi-class task — Softmax Regression from scratch

See [`outputs/05_Modeling_Multiclass_outputs.ipynb`](outputs/) once run on
Kaggle. The 7 attack families are: BENIGN, DoS, DDoS, PortScan, Brute Force,
Web Attack, Bot/Infiltration.

---

## How to run

Notebooks are designed for **Kaggle** (chosen after Colab couldn't fit the
3.4M-row SMOTE step in RAM). To reproduce:

1. Upload the raw `MachineLearningCSV.zip` to Kaggle as a dataset.
2. Run `01_EDA.ipynb` and `02_Preprocessing.ipynb` (Colab or Kaggle — both
   work; these only mount Google Drive on Colab). Output of (02) goes into a
   new Kaggle dataset.
3. Run `03_FeatureEngineering.ipynb` on Kaggle — attach the preprocessing
   output. Save its output as a new dataset.
4. Run `04_FeatureSelection.ipynb` on Kaggle — attach the FE output. This
   produces *both* `train_binary_smote_selected.parquet` and
   `train_multi_smote_selected.parquet`, so it never needs re-running.
5. Run `05_Modeling_Binary.ipynb` and `06_Modeling_Multiclass.ipynb` on
   Kaggle — both attach the FeatureSelection output dataset.

Each notebook's top cell has an `IN_DIR` (or `PROJECT_DIR`) constant — point
it at the mount path Kaggle shows in the **Input** panel for the dataset you
attached.

---

## Design choices worth flagging

- **Init_Win_bytes sentinel.** CICIDS-2017 uses `-1` to mean "no TCP window
  observed" (e.g. non-TCP flows). Preprocessing preserves the `-1` as a
  distinct category and adds binary `has_init_win_*` flags rather than
  clipping it to 0 — the flags turn out to be among the strongest features
  in the binary model.
- **15 classes → 7 attack families.** Heartbleed (11 rows), SQL Injection
  (21 rows), Infiltration (36 rows) are unlearnable after a train/test
  split. Grouping by attack family (e.g. all DoS variants together)
  preserves semantic meaning instead of a meaningless "Other" bucket.
- **SMOTE lives in feature-selection, not feature-engineering.** SMOTE
  interpolates between samples, so it belongs in the *final* feature space —
  after redundant columns are removed. Doing it here also keeps the
  oversampled file column-consistent with the rest of the data (47 features).
- **Multi-class SMOTE is capped, not equalised.** Lifting Web Attack
  (1.7k rows) up to BENIGN's ~1.7M would make it 99.9% synthetic — every
  minority class is capped at 200k rows instead.
- **Feature selection at |r| > 0.95.** Preprocessing already cut redundancy
  at this threshold; this second pass at the same threshold caught 15 new
  pairs because log1p transformation in feature engineering *changed* the
  correlation structure. The redundancy-only strategy never drops a feature
  for being merely weak — only for being redundant with a stronger one.

---

## Dataset citation

> Iman Sharafaldin, Arash Habibi Lashkari, Ali A. Ghorbani, "Toward
> Generating a New Intrusion Detection Dataset and Intrusion Traffic
> Characterization", *4th International Conference on Information Systems
> Security and Privacy* (ICISSP), Portugal, January 2018.
